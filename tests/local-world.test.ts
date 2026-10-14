import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  LocalConnection,
  SOLO_BACKUP_KEY,
  SOLO_TOKEN_KEY,
  SOLO_WORLD_KEY,
  SoloBusyError,
  sanitiseName,
  type SoloLocks,
  type SoloStorage,
} from "../apps/client/src/local-world";
import { createConnection, preferredMode } from "../apps/client/src/network";
import { NPCS } from "../packages/simulation/map";
import {
  distance,
  type CombatEvent,
  type Notice,
  type Snapshot,
} from "../packages/contracts/game";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(
  condition: () => boolean,
  message: string,
  timeout = 3000,
) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) throw new Error(message);
    await sleep(10);
  }
}
function memoryStorage(): SoloStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}
/** Web Locks stand-in shared by the "tabs" of one test. */
function tabLocks(): SoloLocks {
  const held = new Set<string>();
  const request = async (
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<unknown>,
  ) => {
    while (held.has(name)) {
      if (!options.signal) return callback(null);
      if (options.signal.aborted) throw options.signal.reason;
      await sleep(5);
    }
    held.add(name);
    try {
      return await callback({ name, mode: "exclusive" });
    } finally {
      held.delete(name);
    }
  };
  return { request: request as SoloLocks["request"] };
}
type Probe = {
  connection: LocalConnection;
  snapshots: Snapshot[];
  notices: Notice[];
  statuses: string[];
  last: () => Snapshot;
  me: () => Snapshot["actors"][number];
};
function probe(connection: LocalConnection): Probe {
  const p: Probe = {
    connection,
    snapshots: [],
    notices: [],
    statuses: [],
    last: () => p.snapshots.at(-1)!,
    me: () => p.last().actors.find((a) => a.id === p.last().self.id)!,
  };
  connection.onSnapshot = (s) => p.snapshots.push(s);
  connection.onNotice = (n) => p.notices.push(n);
  connection.onStatus = (s) => p.statuses.push(s);
  return p;
}

test("mode selection defaults to solo and creates the matching connection", () => {
  assert.equal(preferredMode(""), "solo");
  assert.equal(preferredMode("?quality=low"), "solo");
  assert.equal(preferredMode("?server"), "server");
  assert.equal(preferredMode("?mode=server"), "server");
  assert.equal(preferredMode("?mode=solo"), "solo");
  const solo = createConnection("solo");
  assert.equal(solo.mode, "solo");
  assert.ok(solo instanceof LocalConnection);
  assert.equal(createConnection("server").mode, "server");
  solo.leave();
});

test("names are sanitised like the server", () => {
  assert.equal(sanitiseName("  Wren  "), "Wren");
  assert.equal(sanitiseName("<b>Zed!</b>"), "bZedb");
  assert.equal(
    sanitiseName("Ãine O'Neil-Ríos the Very Long"),
    "Ãine O'Neil-Ríos the",
  );
  assert.equal(sanitiseName("!!!"), "Traveller");
  assert.equal(sanitiseName(""), "Traveller");
  assert.equal(sanitiseName(undefined), "Traveller");
});

test("join connects, snapshots self, moves and reaches the world", async () => {
  const storage = memoryStorage();
  const p = probe(new LocalConnection({ storage }));
  try {
    const started = Date.now();
    await p.connection.join("  <Wren>  ", "cyborg");
    await until(
      () => p.statuses.includes("Connected") && p.snapshots.length > 0,
      "No connection or snapshot",
      300,
    );
    assert.ok(Date.now() - started < 300);
    const self = p.me();
    assert.equal(self.name, "Wren");
    assert.equal(self.guild, "cyborg");
    assert.equal(self.kind, "player");
    assert.equal(p.last().self.id, p.connection.id);
    assert.match(p.connection.id, /^solo-[a-f0-9]{24}$/);
    assert.equal(p.last().population, 1);

    // Snapshots run at 10 Hz from a 20 Hz world.
    const count = p.snapshots.length,
      tick = p.last().tick;
    await sleep(500);
    assert.ok(p.snapshots.length - count >= 3, "Snapshots are not streaming");
    assert.ok(p.last().tick - tick >= 6, "The world is not stepping");
    assert.equal(p.last().tick % 2, 0);

    // Moves expire after 0.25 s, so the client repeats them like App does.
    const before = p.me();
    for (let i = 0; i < 6; i++) {
      p.connection.send({ type: "move", x: 1, z: 0 });
      await sleep(80);
    }
    p.connection.send({ type: "move", x: 0, z: 0 });
    await sleep(120);
    const after = p.me();
    assert.ok(after.x - before.x > 1, `Moved only ${after.x - before.x} m`);
    assert.ok(Math.abs(after.z - before.z) < 0.2);

    // Mutating a delivered snapshot must not reach the authoritative world.
    p.last().self.inventory.length = 0;
    p.me().hp = 1;
    await sleep(150);
    assert.ok(p.last().self.inventory.length > 0);
    assert.ok(p.me().hp > 1);
  } finally {
    p.connection.leave();
  }
});

test(
  "interactions return notices and dialogue",
  { timeout: 15000 },
  async () => {
    const p = probe(new LocalConnection({ storage: memoryStorage() }));
    try {
      await p.connection.join("Scribe", "knight");
      p.connection.send({ type: "interact", target: "inscription" });
      await until(() => p.notices.length > 0, "No out-of-range notice", 300);
      assert.deepEqual(p.notices[0], {
        kind: "error",
        text: "Move closer to examine the stone.",
        speaker: undefined,
      });
      // Walk to Mara the way the client does and accept the expedition.
      const deadline = Date.now() + 6000;
      while (distance(p.me(), NPCS.mara) > 2.4) {
        assert.ok(Date.now() < deadline, "Could not reach Mara");
        const me = p.me(),
          d = distance(me, NPCS.mara);
        p.connection.send({
          type: "move",
          x: (NPCS.mara.x - me.x) / d,
          z: (NPCS.mara.z - me.z) / d,
        });
        await sleep(70);
      }
      p.connection.send({ type: "move", x: 0, z: 0 });
      p.connection.send({ type: "interact", target: "mara" });
      await until(
        () => p.notices.some((n) => n.speaker === "Mara"),
        "Mara did not answer",
        500,
      );
      const mara = p.notices.find((n) => n.speaker === "Mara")!;
      assert.equal(mara.kind, "dialogue");
      await until(
        () => p.last().self.quest === "accepted",
        "Quest not accepted",
      );
    } finally {
      p.connection.leave();
    }
  },
);

test("commands are limited per kind like the server", async () => {
  const p = probe(new LocalConnection({ storage: memoryStorage() }));
  try {
    await p.connection.join("Hasty", "knight");
    // Synchronous sends share one simulated second: 10 actions, 30 moves.
    for (let i = 0; i < 40; i++)
      p.connection.send({ type: "interact", target: "inscription" });
    for (let i = 0; i < 40; i++)
      p.connection.send({ type: "move", x: i % 2 ? 1 : -1, z: 0 });
    await sleep(60);
    assert.equal(p.notices.length, 10);
    // The 30th accepted move carries sequence 70 (10 actions + 30 dropped + 30).
    assert.equal(p.connection.world.actors.get(p.connection.id)!.lastSeq, 70);
  } finally {
    p.connection.leave();
  }
});

test(
  "events stay visible for less than two seconds",
  { timeout: 8000 },
  async () => {
    const p = probe(new LocalConnection({ storage: memoryStorage() }));
    try {
      await p.connection.join("Dodger", "knight");
      await until(() => p.snapshots.length > 1, "No snapshots");
      p.connection.send({ type: "ability", key: "space" });
      const find = (s: Snapshot) =>
        s.events.find((e) => e.type === "dodge" && e.source === s.self.id);
      await until(() => Boolean(find(p.last())), "Evade event missing", 500);
      const event = find(p.last()) as CombatEvent;
      const firstSeen = p.snapshots.length - 1;
      await until(
        () => !p.last().events.some((e) => e.id === event.id),
        "Event never expired",
        3000,
      );
      const carrying = p.snapshots
        .slice(firstSeen)
        .filter((s) => s.events.some((e) => e.id === event.id));
      assert.ok(carrying.length >= 10, `Seen in ${carrying.length} snapshots`);
      for (const s of carrying) assert.ok(s.now - event.at < 2);
      const expired = p.snapshots.at(-1)!;
      assert.ok(expired.now - event.at >= 1.99);
      // Each id is delivered once per snapshot.
      for (const s of carrying)
        assert.equal(new Set(s.events.map((e) => e.id)).size, s.events.length);
    } finally {
      p.connection.leave();
    }
  },
);

test(
  "solo progress survives leave and a new page",
  { timeout: 8000 },
  async () => {
    const storage = memoryStorage();
    const first = probe(new LocalConnection({ storage }));
    await first.connection.join("Keeper", "knight");
    first.connection.send({ type: "guild", guild: "cyborg" });
    await until(() => first.me().guild === "cyborg", "Guild change missing");
    await until(
      () =>
        (
          JSON.parse(storage.values.get(SOLO_WORLD_KEY)!) as {
            players: { guild: string }[];
          }
        ).players[0].guild === "cyborg",
      "Non-move command was not persisted",
      1000,
    );
    for (let i = 0; i < 4; i++) {
      first.connection.send({ type: "move", x: 0, z: 1 });
      await sleep(80);
    }
    first.connection.send({ type: "move", x: 0, z: 0 });
    await sleep(150);
    const position = first.me();
    first.connection.leave();
    first.connection.leave();
    const statuses = first.statuses.length;
    const count = first.snapshots.length;
    await sleep(200);
    assert.equal(first.snapshots.length, count, "Snapshots after leave");
    assert.equal(first.statuses.length, statuses);
    first.connection.send({ type: "move", x: 1, z: 0 });

    const saved = JSON.parse(storage.values.get(SOLO_WORLD_KEY)!);
    assert.equal(saved.version, 1);
    assert.equal(saved.players[0].id, first.connection.id);
    assert.equal(saved.players[0].connected, false);
    assert.match(storage.values.get(SOLO_TOKEN_KEY)!, /^[a-f0-9]{64}$/);

    const second = probe(new LocalConnection({ storage }));
    try {
      assert.equal(second.connection.id, first.connection.id);
      await second.connection.join("Somebody else", "knight");
      const me = second.me();
      assert.equal(me.name, "Keeper", "A returning traveller keeps their name");
      assert.equal(me.guild, "cyborg");
      assert.ok(distance(me, position) < 0.3, "Position was not restored");
      assert.ok(second.last().now >= first.last().now);
      assert.deepEqual(
        second.last().self.inventory.map((i) => i.id),
        first.last().self.inventory.map((i) => i.id),
      );
      // Join after leave on the same connection reuses the live world.
      second.connection.leave();
      second.snapshots.length = 0;
      await second.connection.join("Keeper", "knight");
      await until(() => second.snapshots.length > 2, "Rejoin did not stream");
    } finally {
      second.connection.leave();
    }
  },
);

test(
  "a page opened before another tab played continues from the newest save",
  { timeout: 8000 },
  async () => {
    const storage = memoryStorage();
    // The stale page loads first and waits on the entrance screen.
    const stale = probe(new LocalConnection({ storage }));
    const active = probe(new LocalConnection({ storage }));
    await active.connection.join("Keeper", "knight");
    active.connection.send({ type: "guild", guild: "cyborg" });
    await until(() => active.me().guild === "cyborg", "Guild change missing");
    active.connection.leave();
    try {
      await stale.connection.join("Keeper", "knight");
      assert.equal(stale.me().guild, "cyborg", "Stale copy replaced progress");
      const saved = JSON.parse(storage.values.get(SOLO_WORLD_KEY)!) as {
        players: { guild: string }[];
      };
      assert.equal(saved.players[0].guild, "cyborg");
    } finally {
      stale.connection.leave();
    }
  },
);

test("only one tab plays the solo world at a time", async () => {
  const storage = memoryStorage();
  const locks = tabLocks();
  const first = probe(new LocalConnection({ storage, locks }));
  const second = probe(new LocalConnection({ storage, locks }));
  await first.connection.join("Keeper", "knight");
  try {
    await assert.rejects(
      second.connection.join("Keeper", "knight"),
      SoloBusyError,
    );
    assert.equal(second.snapshots.length, 0);
  } finally {
    first.connection.leave();
  }
  // Closing the first tab hands the world over.
  await second.connection.join("Keeper", "knight");
  try {
    await until(() => second.snapshots.length > 0, "Second tab did not start");
    // Leaving and re-entering at once waits out this page's own release.
    second.connection.leave();
    await second.connection.join("Keeper", "knight");
  } finally {
    second.connection.leave();
  }
});

test("corrupt or unavailable storage starts a playable fresh world", async () => {
  const storage = memoryStorage();
  storage.values.set(SOLO_WORLD_KEY, "{not json");
  const warn = console.warn;
  console.warn = () => {};
  let corrupt: LocalConnection;
  try {
    corrupt = new LocalConnection({ storage, locks: null });
  } finally {
    console.warn = warn;
  }
  assert.equal(storage.values.get(`${SOLO_WORLD_KEY}-corrupt`), "{not json");
  const invalid = memoryStorage();
  invalid.values.set(SOLO_WORLD_KEY, JSON.stringify({ version: 2 }));
  console.warn = () => {};
  try {
    new LocalConnection({ storage: invalid });
  } finally {
    console.warn = warn;
  }
  assert.ok(invalid.values.has(`${SOLO_WORLD_KEY}-corrupt`));

  const broken: SoloStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
  const p = probe(new LocalConnection({ storage: broken, locks: null }));
  const q = probe(corrupt);
  try {
    await p.connection.join("Ghost", "knight");
    await q.connection.join("Fresh", "knight");
    await until(
      () => p.snapshots.length > 2 && q.snapshots.length > 2,
      "Fallback worlds are not running",
    );
    assert.equal(p.me().name, "Ghost");
    assert.equal(q.me().name, "Fresh");
    // The memory fallback keeps the identity for this page session.
    assert.equal(new LocalConnection({ storage: broken }).id, p.connection.id);
  } finally {
    p.connection.leave();
    q.connection.leave();
  }
});

test("background catch-up is clamped to five steps per callback", async () => {
  let clock = 0;
  const p = probe(
    new LocalConnection({ storage: memoryStorage(), now: () => clock }),
  );
  try {
    await p.connection.join("Sleeper", "knight");
    const tick = p.last().tick;
    clock += 60_000;
    await until(() => p.snapshots.length > 1, "No catch-up snapshot");
    assert.equal(p.last().tick - tick, 5);
    await sleep(100);
    assert.equal(p.last().tick - tick, 5, "The backlog was not dropped");
  } finally {
    p.connection.leave();
  }
});

test(
  "a new solo world sets a failing save aside and plays fresh",
  { timeout: 8000 },
  async () => {
    const storage = memoryStorage();
    const first = probe(new LocalConnection({ storage, locks: tabLocks() }));
    await first.connection.join("Keeper", "knight");
    first.connection.send({ type: "guild", guild: "cyborg" });
    await until(() => first.me().guild === "cyborg", "Guild change missing");
    first.connection.leave();

    // A save whose world throws on every step stops the world again on reload.
    const p = probe(new LocalConnection({ storage, locks: tabLocks() }));
    await p.connection.join("Keeper", "knight");
    const save = storage.values.get(SOLO_WORLD_KEY)!;
    assert.equal(p.me().guild, "cyborg");
    const error = console.error;
    console.error = () => {};
    try {
      p.connection.world.step = () => {
        throw new Error("Broken save");
      };
      await until(
        () => p.statuses.some((s) => s.includes("stopped after an error")),
        "The broken world kept running",
      );
    } finally {
      console.error = error;
    }
    assert.equal(storage.values.get(SOLO_WORLD_KEY), save, "Failure saved");
    const count = p.snapshots.length;
    await p.connection.join("Keeper", "knight");
    assert.equal(p.snapshots.length, count, "A stopped world rejoined");

    await p.connection.startFresh();
    assert.equal(storage.values.get(SOLO_BACKUP_KEY), save, "Save not kept");
    assert.ok(!storage.values.has(SOLO_WORLD_KEY), "Old save still loads");
    try {
      await p.connection.join("Wren", "knight");
      await until(() => p.snapshots.length > count + 2, "Fresh world idle");
      assert.equal(p.me().name, "Wren", "The old traveller came back");
      assert.equal(p.me().guild, "knight");
      assert.equal(p.last().self.quest, "unheard");
      assert.equal(p.last().self.id, first.connection.id, "Identity changed");
      const fresh = JSON.parse(storage.values.get(SOLO_WORLD_KEY)!) as {
        players: { name: string }[];
      };
      assert.deepEqual(
        fresh.players.map((player) => player.name),
        ["Wren"],
      );
    } finally {
      p.connection.leave();
    }
    // The backup is never overwritten by play in the new world.
    assert.equal(storage.values.get(SOLO_BACKUP_KEY), save);
  },
);

test("an unreadable save that cannot be backed up is never overwritten", async () => {
  const storage = memoryStorage();
  storage.values.set(SOLO_WORLD_KEY, "{not json");
  // Storage is full: backups are refused, the primary key still accepts writes.
  const full: SoloStorage = {
    ...storage,
    setItem: (key, value) => {
      if (key !== SOLO_WORLD_KEY) throw new Error("QuotaExceededError");
      storage.setItem(key, value);
    },
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const p = probe(new LocalConnection({ storage: full, locks: null }));
    await p.connection.join("Fresh", "knight");
    try {
      await until(() => p.snapshots.length > 2, "The fresh world did not run");
    } finally {
      p.connection.leave();
    }
  } finally {
    console.warn = warn;
  }
  assert.equal(storage.values.get(SOLO_WORLD_KEY), "{not json");
});

test("repeated resets and a later corrupt load keep the recent backups", async () => {
  const storage = memoryStorage();
  const solo = new LocalConnection({ storage, locks: null });
  for (const save of ["save-1", "save-2", "save-3", "save-4"]) {
    storage.values.set(SOLO_WORLD_KEY, save);
    await solo.startFresh();
  }
  assert.equal(storage.values.get(SOLO_BACKUP_KEY), "save-4");
  assert.equal(storage.values.get(`${SOLO_BACKUP_KEY}-1`), "save-3");
  assert.equal(storage.values.get(`${SOLO_BACKUP_KEY}-2`), "save-2");
  assert.ok(!storage.values.has(`${SOLO_BACKUP_KEY}-3`), "Unbounded history");

  // An unreadable save found on load joins the same history.
  storage.values.set(SOLO_WORLD_KEY, "{not json");
  const warn = console.warn;
  console.warn = () => {};
  try {
    new LocalConnection({ storage, locks: null });
  } finally {
    console.warn = warn;
  }
  assert.equal(storage.values.get(SOLO_BACKUP_KEY), "{not json");
  assert.equal(storage.values.get(`${SOLO_BACKUP_KEY}-1`), "save-4");
  assert.equal(storage.values.get(`${SOLO_BACKUP_KEY}-2`), "save-3");
});

test("a new solo world never discards a save it cannot set aside", async () => {
  const storage = memoryStorage();
  const locks = tabLocks();
  const first = probe(new LocalConnection({ storage, locks }));
  await first.connection.join("Keeper", "knight");
  const other = new LocalConnection({ storage, locks });
  try {
    // Another tab is playing this save.
    await assert.rejects(other.startFresh(), SoloBusyError);
  } finally {
    first.connection.leave();
  }
  const save = storage.values.get(SOLO_WORLD_KEY)!;
  assert.ok(save);
  assert.ok(!storage.values.has(SOLO_BACKUP_KEY));

  // The browser refuses the backup write, for example when storage is full.
  const full: SoloStorage = {
    ...storage,
    setItem: (key, value) => {
      if (key === SOLO_BACKUP_KEY) throw new Error("QuotaExceededError");
      storage.setItem(key, value);
    },
  };
  const refused = probe(new LocalConnection({ storage: full, locks: null }));
  await assert.rejects(refused.connection.startFresh(), /left as it is/);
  assert.equal(storage.values.get(SOLO_WORLD_KEY), save);
  assert.ok(!storage.values.has(SOLO_BACKUP_KEY));
  try {
    await refused.connection.join("Somebody else", "knight");
    assert.equal(refused.me().name, "Keeper", "The kept save did not load");
  } finally {
    refused.connection.leave();
  }
});
