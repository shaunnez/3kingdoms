import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client, type Room } from "@colyseus/sdk";
import { World } from "../packages/simulation/world";
import { PROTOCOL, type Snapshot } from "../packages/contracts/game";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(
  condition: () => boolean,
  message: string,
  timeout = 6000,
) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await sleep(30);
  }
}
type Peer = {
  room: Room;
  snapshot: Snapshot | null;
  seq: number;
  token: string;
  send: (body: Record<string, unknown>) => void;
};

test(
  "real WebSocket clients enforce safety, loot quotas, replay protection and reconnect ownership",
  { timeout: 45000 },
  async () => {
    mkdirSync(".local", { recursive: true });
    const directory = mkdtempSync(".local/network-test-"),
      save = resolve(directory, "world.json");
    const world = new World(),
      tokens = Array.from({ length: 6 }, () => randomBytes(32).toString("hex"));
    const ids = tokens.map((t) =>
      createHash("sha256").update(t).digest("hex").slice(0, 24),
    );
    const positions = [
      { x: 0, z: 50 },
      { x: 0, z: 51.8 },
      { x: 5, z: 50 },
      { x: 5, z: 51.8 },
      { x: 0, z: -0.5 },
      { x: 0, z: 0.5 },
    ];
    ids.forEach((id, index) => {
      const p = world.join(id, `Network ${index}`, "knight");
      Object.assign(p, positions[index]);
      p.downedLock = 1000;
      if (index === 1) p.hp = 100;
      if (index === 2) {
        p.hp = 50;
        p.red = 600;
      }
    });
    writeFileSync(save, JSON.stringify(world.save()));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "apps/server/main.ts"],
      {
        env: { ...process.env, THREEFOLD_PORT: "2579", THREEFOLD_SAVE: save },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    child.stdout.on("data", (b) => (logs += b.toString()));
    child.stderr.on("data", (b) => (logs += b.toString()));
    const peers: Peer[] = [];
    const client = new Client("http://127.0.0.1:2579");
    async function join(token: string): Promise<Peer> {
      const room = await client.joinOrCreate("briar-gate", {
        protocol: PROTOCOL,
        token,
        name: "Network traveller",
        guild: "knight",
      });
      const p: Peer = {
        room,
        snapshot: null,
        seq: 0,
        token,
        send(body) {
          room.send("command", { seq: ++p.seq, ...body });
        },
      };
      room.onMessage("snapshot", (s: Snapshot) => (p.snapshot = s));
      room.onMessage("welcome", () => {});
      room.onMessage("notice", () => {});
      peers.push(p);
      await until(() => Boolean(p.snapshot), "Initial snapshot missing");
      return p;
    }
    try {
      await until(
        () => logs.includes("checkpoint-ready"),
        `Server did not start: ${logs}`,
      );
      const a = await join(tokens[0]),
        b = await join(tokens[1]);
      await until(
        () => a.snapshot!.population === 2,
        "Clients are not in one world",
      );
      await assert.rejects(
        () =>
          client.joinOrCreate("briar-gate", {
            protocol: PROTOCOL,
            token: tokens[0],
          }),
        /already connected/,
      );
      await assert.rejects(
        () =>
          client.joinOrCreate("briar-gate", {
            protocol: 999,
            token: randomBytes(32).toString("hex"),
          }),
        /protocol/,
      );
      a.send({ type: "ability", key: "basic", target: ids[1] });
      await until(
        () => a.snapshot!.actors.find((p) => p.id === ids[0])!.red > 0,
        "Aggressor not marked",
      );
      await until(
        () => a.snapshot!.now >= (a.snapshot!.self.cooldowns.basic ?? Infinity),
        "Attack recovery stalled",
      );
      a.send({ type: "ability", key: "basic", target: ids[1] });
      await until(
        () => a.snapshot!.corpses.some((c) => c.victim === ids[1]),
        "Death escrow missing",
      );
      const corpse = a.snapshot!.corpses.find((c) => c.victim === ids[1])!;
      assert.equal(corpse.quota, 1);
      assert.ok(corpse.items.every((i) => !i.protected));
      assert.ok(a.snapshot!.actors.find((p) => p.id === ids[0])!.killer);
      b.send({ type: "claim", corpse: corpse.id, item: corpse.items[0].id });
      const claim = {
        seq: ++a.seq,
        type: "claim",
        corpse: corpse.id,
        item: corpse.items[0].id,
      };
      a.room.send("command", claim);
      a.room.send("command", claim);
      await until(
        () =>
          a.snapshot!.self.inventory.some((i) => i.id === corpse.items[0].id),
        "The authorized claim did not complete",
      );
      assert.equal(
        a.snapshot!.self.inventory.filter((i) => i.id === corpse.items[0].id)
          .length,
        1,
      );
      assert.equal(
        a.snapshot!.corpses.some((c) => c.id === corpse.id),
        false,
      );
      assert.equal(
        b.snapshot!.self.inventory.some((i) => i.id === corpse.items[0].id),
        false,
      );
      const c = await join(tokens[2]),
        d = await join(tokens[3]);
      d.send({ type: "ability", key: "basic", target: ids[2] });
      await until(
        () => d.snapshot!.corpses.some((c) => c.victim === ids[2]),
        "Red victim escrow missing",
      );
      const redCorpse = d.snapshot!.corpses.find((c) => c.victim === ids[2])!;
      assert.equal(redCorpse.quota, 2);
      assert.equal(d.snapshot!.actors.find((p) => p.id === ids[3])!.red, 0);
      for (const item of redCorpse.items.slice(0, 2)) {
        d.send({ type: "claim", corpse: redCorpse.id, item: item.id });
        await until(
          () => d.snapshot!.self.inventory.some((i) => i.id === item.id),
          "Two-item claim failed",
        );
      }
      assert.equal(
        d.snapshot!.corpses.some((c) => c.id === redCorpse.id),
        false,
      );
      const owned = a.snapshot!.self.inventory.map((i) => i.id).sort();
      await a.room.leave();
      await until(
        () =>
          d.snapshot!.actors.find((p) => p.id === ids[0])?.connected === false,
        "Disconnected body missing",
      );
      const red = d.snapshot!.actors.find((p) => p.id === ids[0])!.red;
      await sleep(350);
      assert.equal(d.snapshot!.actors.find((p) => p.id === ids[0])!.red, red);
      const returning = await join(tokens[0]);
      assert.deepEqual(
        returning.snapshot!.self.inventory.map((i) => i.id).sort(),
        owned,
      );
      assert.ok(
        returning.snapshot!.actors.find((p) => p.id === ids[0])!.red >=
          red - 0.2,
      );
      const e = await join(tokens[4]),
        f = await join(tokens[5]);
      e.send({ type: "ability", key: "basic", target: ids[5] });
      f.send({ type: "ability", key: "basic", target: ids[4] });
      await sleep(200);
      assert.equal(e.snapshot!.actors.find((p) => p.id === ids[4])!.red, 0);
      assert.equal(f.snapshot!.actors.find((p) => p.id === ids[5])!.red, 0);
      for (let i = 0; i < 4; i++) {
        e.send({ type: "move", x: 0, z: 1 });
        await sleep(100);
      }
      e.send({ type: "move", x: 0, z: 0 });
      const hp = f.snapshot!.actors.find((p) => p.id === ids[5])!.hp;
      e.send({ type: "ability", key: "basic", target: ids[5] });
      f.send({ type: "move", x: 0, z: -1 });
      await sleep(150);
      f.send({ type: "move", x: 0, z: 0 });
      await sleep(400);
      assert.equal(
        f.snapshot!.actors.find((p) => p.id === ids[5])!.hp,
        hp,
        "A late hit crossed the town safety boundary",
      );
      assert.ok(e.snapshot!.actors.find((p) => p.id === ids[4])!.red > 0);
      const sameToken = randomBytes(32).toString("hex");
      const simultaneous = await Promise.allSettled([
        join(sameToken),
        join(sameToken),
      ]);
      assert.equal(
        simultaneous.filter((result) => result.status === "fulfilled").length,
        1,
        "Concurrent handshakes admitted a duplicate identity",
      );
      for (let i = 0; i < 9; i++) await join(randomBytes(32).toString("hex"));
      await until(
        () => e.snapshot!.population === 16,
        "Sixteen travellers did not share one room",
      );
      await assert.rejects(
        () =>
          client.joinOrCreate("briar-gate", {
            protocol: PROTOCOL,
            token: randomBytes(32).toString("hex"),
          }),
        /full/,
      );
      const before = e.snapshot!.now;
      await sleep(300);
      assert.ok(
        e.snapshot!.now - before < 0.6,
        "A refused seventeenth player started a second world ticker",
      );
      const persisted = JSON.parse(readFileSync(save, "utf8")) as ReturnType<
        World["save"]
      >;
      assert.equal(persisted.receipts.length, 3);
      assert.equal(new Set(persisted.receipts).size, 3);
      const allItems = persisted.players.flatMap((p) =>
        p.inventory.map((i) => i.id),
      );
      assert.equal(
        allItems.length,
        new Set(allItems).size,
        "An item exists in two inventories",
      );
      writeFileSync(
        resolve(directory, "result.json"),
        JSON.stringify(
          {
            status: "passed",
            clients: 6,
            transport: "real Colyseus WebSockets",
            durableClaims: 3,
            save,
            checks: [
              "safe source and target",
              "late hit boundary",
              "red on aggression",
              "one item on clean death",
              "two items on outlaw death",
              "lawful hunter",
              "atomic replay",
              "offline timer pause",
              "reconnect possessions",
            ],
          },
          null,
          2,
        ),
      );
    } finally {
      await Promise.race([
        Promise.allSettled(peers.map((p) => p.room.leave())),
        sleep(500),
      ]);
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) resolve();
          else child.once("exit", () => resolve());
        }),
        sleep(2000),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  },
);
