// @refresh reset
import React, { useEffect, useRef, useState } from "react";
import {
  BUILD,
  GUILDS,
  KITS,
  distance,
  type AbilityKey,
  type ActorView,
  type Guild,
  type Notice,
  type Snapshot,
  type Vec2,
} from "../../../packages/contracts/game";
import { NPCS, REFUGE } from "../../../packages/simulation/map";
import { Connection } from "./network";
import { GameScene } from "./scene";
import { Soundscape } from "./audio";
import { FieldLab } from "./FieldLab";
import { canDisplayTarget } from "./combat-presentation";
import "./style.css";

const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;
const title = (guild: Guild) => (guild === "knight" ? "Knight" : "Cyborg");
const icons = [
  "⚔",
  "◈",
  "♜",
  "◇",
  "⚑",
  "✧",
  "➶",
  "ϟ",
  "⊓",
  "⊙",
  "❄",
  "✦",
  "☼",
  "▰",
  "▱",
  "✥",
];
function Icon({
  index,
  className = "",
}: {
  index: number;
  className?: string;
}) {
  return (
    <span
      className={`ability-art ${className}`}
      style={{
        backgroundPosition: `${((index % 4) * 100) / 3}% ${(Math.floor(index / 4) * 100) / 3}%`,
      }}
      aria-hidden="true"
    >
      <span>{icons[index]}</span>
    </span>
  );
}
export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<GameScene | null>(null),
    connection = useRef(new Connection()),
    sound = useRef(new Soundscape());
  const snap = useRef<Snapshot | null>(null),
    keys = useRef(new Set<string>()),
    targetRef = useRef(""),
    destination = useRef<Vec2 | null>(null),
    blocked = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [progress, setProgress] = useState("Opening the Briar Gate…"),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [joining, setJoining] = useState(false);
  const [guild, setGuild] = useState<Guild>("knight"),
    [name, setName] = useState("Thorne"),
    [panel, setPanel] = useState<"inventory" | "guilds" | "settings" | null>(
      null,
    ),
    [dialogue, setDialogue] = useState<Notice | null>(null),
    [log, setLog] = useState<string[]>([
      "The rain has stopped. The road is still listening.",
    ]),
    [toast, setToast] = useState(""),
    [muted, setMuted] = useState(true),
    [low, setLow] = useState(false),
    [help, setHelp] = useState(false),
    [corpse, setCorpse] = useState<string | null>(null);
  const select = (id: string) => {
    const s = snap.current,
      actor = s?.actors.find((a) => a.id === id),
      observer = s?.actors.find((a) => a.id === s.self.id);
    if (id && actor && observer && !canDisplayTarget(actor, observer)) return;
    targetRef.current = id;
    setSelected(id);
    scene.current?.select(id);
  };
  const me = snapshot?.actors.find((a) => a.id === snapshot.self.id),
    target = snapshot?.actors.find((a) => a.id === selected);
  const useAbility = (key: AbilityKey) => {
    if (!snapshot || !me || me.life !== "alive") return;
    connection.current.send({
      type: "ability",
      key,
      target: targetRef.current,
      aim: scene.current?.aim,
    });
  };
  useEffect(() => {
    setSnapshot(null);
    snap.current = null;
    setReady(false);
    setMuted(true);
    setStatus("");
    const renderer = new GameScene(canvas.current!, setProgress);
    scene.current = renderer;
    renderer.onSelect = select;
    renderer.onGround = (p) => {
      destination.current = p;
    };
    renderer.onFrame = () => {
      const s = snap.current;
      if (!s) return;
      const observer = s.actors.find((a) => a.id === s.self.id);
      const selectedActor = s.actors.find((a) => a.id === targetRef.current);
      if (
        targetRef.current &&
        observer &&
        (!selectedActor ||
          !canDisplayTarget(selectedActor, observer) ||
          !renderer.project(selectedActor).visible)
      )
        select("");
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-world-id]",
      )) {
        const id = el.dataset.worldId;
        const event = id?.startsWith("event-")
          ? s.events.find((e) => `event-${e.id}` === id)
          : null;
        const a =
          event ??
          s.actors.find((a) => a.id === id) ??
          s.corpses.find((c) => c.id === id) ??
          (id === "inscription" ? NPCS.inscription : null);
        if (!a) continue;
        const p = renderer.project(
          a,
          event
            ? 1.5 + (s.now - event.at) * 0.6
            : id === "inscription"
              ? 0.7
              : 2.1,
        );
        el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%, -100%)`;
        el.style.visibility = p.visible ? "visible" : "hidden";
      }
    };
    void renderer
      .load()
      .then(() => setReady(true))
      .catch((error) => {
        setProgress(`The scene could not load: ${String(error)}`);
      });
    connection.current.onSnapshot = (s) => {
      snap.current = s;
      setSnapshot(s);
      renderer.setSnapshot(s);
      sound.current.events(s.events, s.actors, s.self.id);
      const p = s.actors.find((a) => a.id === s.self.id);
      sound.current.zone(Boolean(p && !p.safe));
    };
    connection.current.onNotice = (n) => {
      setLog((lines) => [
        ...lines.slice(-19),
        `${n.speaker ? n.speaker + ": " : ""}${n.text}`,
      ]);
      if (n.kind === "dialogue") setDialogue(n);
      else {
        setToast(n.text);
        setTimeout(() => setToast(""), 4000);
      }
    };
    connection.current.onStatus = setStatus;
    const stop = () => {
      keys.current.clear();
      destination.current = null;
      connection.current.send({ type: "move", x: 0, z: 0 });
      connection.current.send({ type: "cancel" });
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      if (
        snap.current &&
        !blocked.current &&
        [
          "Tab",
          " ",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.key)
      )
        e.preventDefault();
      if (e.key === "Escape") {
        stop();
        setPanel(null);
        setDialogue(null);
        setCorpse(null);
        setHelp(false);
        select("");
        return;
      }
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "i") {
        setPanel((p) => (p === "inventory" ? null : "inventory"));
        return;
      }
      if (k === "g") {
        setPanel((p) => (p === "guilds" ? null : "guilds"));
        return;
      }
      if (k === "h") {
        setHelp((p) => !p);
        return;
      }
      if (blocked.current) return;
      keys.current.add(k);
      destination.current = null;
      const s = snap.current,
        p = s?.actors.find((a) => a.id === s.self.id);
      if (!s || !p) return;
      if (k === "tab") {
        const list = s.actors
          .filter(
            (a) =>
              a.kind === "wolf" &&
              canDisplayTarget(a, p) &&
              renderer.project(a).visible,
          )
          .sort((a, b) => distance(p, a) - distance(p, b));
        const index = list.findIndex((a) => a.id === targetRef.current);
        if (list.length) select(list[(index + 1) % list.length].id);
      } else if (k === "e") {
        const nearby = s.actors
          .filter(
            (a) =>
              ["mara", "merchant", "guard"].includes(a.kind) &&
              distance(p, a) < 3,
          )
          .sort((a, b) => distance(p, a) - distance(p, b))[0];
        const remains = s.corpses.find((c) => distance(p, c) < 3);
        if (remains) setCorpse(remains.id);
        else
          connection.current.send({
            type: "interact",
            target:
              distance(p, NPCS.inscription) < 3
                ? "inscription"
                : (nearby?.id ?? targetRef.current),
          });
      } else if (["1", "2", "3", "4", "5", "r", "q", "c", " "].includes(k))
        connection.current.send({
          type: "ability",
          key: k === " " ? "space" : (k as AbilityKey),
          target: targetRef.current,
          aim: renderer.aim,
        });
      else if (k === "[") renderer.rotate(-1);
      else if (k === "]") renderer.rotate(1);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    let previous = { x: 0, z: 0 },
      lastStep = 0;
    const interval = setInterval(() => {
      const s = snap.current,
        p = s?.actors.find((a) => a.id === s.self.id);
      if (!p || blocked.current || document.hidden) return;
      let x =
          (keys.current.has("d") || keys.current.has("arrowright") ? 1 : 0) -
          (keys.current.has("a") || keys.current.has("arrowleft") ? 1 : 0),
        z =
          (keys.current.has("w") || keys.current.has("arrowup") ? 1 : 0) -
          (keys.current.has("s") || keys.current.has("arrowdown") ? 1 : 0);
      let direction = renderer.direction(x, z);
      if (destination.current) {
        const d = distance(p, destination.current);
        if (d < 0.3) destination.current = null;
        else
          direction = {
            x: (destination.current.x - p.x) / d,
            z: (destination.current.z - p.z) / d,
          };
      }
      if (direction.x || direction.z || previous.x || previous.z) {
        connection.current.send({ type: "move", ...direction });
        previous = direction;
      }
      if (
        (direction.x || direction.z) &&
        performance.now() - lastStep > 370 &&
        p.life === "alive"
      ) {
        sound.current.step();
        lastStep = performance.now();
      }
      if (keys.current.has("f"))
        connection.current.send({
          type: "ability",
          key: "basic",
          target: targetRef.current,
        });
    }, 70);
    Object.defineProperty(window, "__THREEFOLD__", {
      configurable: true,
      value: {
        snapshot: () => snap.current,
        metrics: () => renderer.metrics(),
        build: BUILD,
      },
    });
    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
      renderer.dispose();
      sound.current.dispose();
      connection.current.leave();
    };
  }, []);
  useEffect(() => {
    blocked.current = Boolean(panel || dialogue || help);
    if (blocked.current) {
      keys.current.clear();
      destination.current = null;
      connection.current.send({ type: "move", x: 0, z: 0 });
    }
  }, [panel, dialogue, help]);
  async function enter() {
    setJoining(true);
    try {
      void sound.current
        .unlock()
        .then(() => setMuted(false))
        .catch(() => setMuted(true));
      await connection.current.join(name, guild);
    } catch (error) {
      setStatus(String(error));
    } finally {
      setJoining(false);
    }
  }
  const kit = KITS[me?.guild ?? guild];
  const nearest = me
    ? snapshot?.actors
        .filter(
          (a) =>
            ["mara", "merchant", "guard"].includes(a.kind) &&
            distance(me, a) < 3,
        )
        .sort((a, b) => distance(me, a) - distance(me, b))[0]
    : undefined;
  const clueNear = me && distance(me, NPCS.inscription) < 3;
  const corpseView = snapshot?.corpses.find((c) => c.id === corpse);
  return (
    <>
      {snapshot && new URLSearchParams(location.search).has("lab") && (
        <FieldLab
          scene={() => scene.current}
          connection={connection.current}
          snapshot={snapshot}
          select={select}
          selected={selected}
          audioTracks={() => sound.current.captureAudio()}
        />
      )}
      <canvas
        ref={canvas}
        id="world"
        aria-label="Three-dimensional world of Highcross and Briar March"
      />
      {!snapshot ? (
        <main className="entrance">
          <div className="brand-lockup">
            <span className="eyebrow">FANTASY · SCIENCE · CHAOS</span>
            <h1>THREEFOLD</h1>
            <div className="rule">
              <i />A WORLD BETWEEN WORLDS
              <i />
            </div>
          </div>
          <section className="arrival-card">
            <p className="eyebrow">YOUR FIRST EXPEDITION</p>
            <h2>The Briar Gate</h2>
            <p>
              The thirteenth bell has sounded.
              <br />
              Beyond the lanterns, the road remembers.
            </p>
            <label className="name-label" htmlFor="traveller">
              Your traveller’s name
            </label>
            <input
              id="traveller"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="off"
            />
            <div className="class-choice">
              {(["knight", "cyborg"] as Guild[]).map((g) => (
                <button
                  key={g}
                  className={guild === g ? "chosen" : ""}
                  onClick={() => setGuild(g)}
                  aria-pressed={guild === g}
                >
                  <Icon index={g === "knight" ? 1 : 7} />
                  <span>
                    {title(g)}
                    <small>
                      {g === "knight" ? "Blade & resolve" : "Pulse & heat"}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            <button
              className="primary enter"
              disabled={!ready || joining || !name.trim()}
              onClick={() => void enter()}
            >
              {joining
                ? "Entering…"
                : ready
                  ? "Enter Highcross"
                  : "Preparing the world…"}
              <span>↗</span>
            </button>
            <p className="loading-copy" role="status">
              {status || progress}
            </p>
            <p className="checkpoint-note">
              Playable development checkpoint · two practice guilds
              <br />
              The complete game includes all twelve.
            </p>
          </section>
          <div className="entrance-bottom">
            <span>AN ORIGINAL REALM INSPIRED BY 3 KINGDOMS MUD</span>
            <span>HEADPHONES RECOMMENDED</span>
          </div>
        </main>
      ) : (
        <>
          <div className="world-labels" aria-label="Nearby characters">
            {snapshot.events
              .filter((e) => e.amount > 0 && snapshot.now - e.at < 1.1)
              .map((e) => (
                <span
                  key={e.id}
                  data-world-id={`event-${e.id}`}
                  className={`combat-number ${e.type === "heal" ? "healing" : ""}`}
                >
                  {e.type === "heal" ? "+" : ""}
                  {e.amount}
                </span>
              ))}
            {snapshot.actors
              .filter((a) => !me || canDisplayTarget(a, me))
              .map((a) => (
                <button
                  key={a.id}
                  data-world-id={a.id}
                  className={`nameplate ${a.red > 0 ? "outlaw" : ""} ${selected === a.id ? "selected" : ""} ${a.id === snapshot.self.id ? "self" : ""}`}
                  onClick={() => select(a.id)}
                  aria-label={`Target ${a.name}`}
                >
                  <span>
                    {a.red > 0 ? "⚔ " : ""}
                    {a.name}
                    {a.kind === "player" && a.id !== snapshot.self.id ? (
                      <small> · PLAYER</small>
                    ) : null}
                  </span>
                  {(a.hp < a.maxHp || selected === a.id) && (
                    <i>
                      <b style={{ width: `${(a.hp / a.maxHp) * 100}%` }} />
                    </i>
                  )}
                  {a.cast && <em>{a.cast.name}</em>}
                </button>
              ))}
            <button
              data-world-id="inscription"
              className="nameplate clue"
              onClick={() =>
                connection.current.send({
                  type: "interact",
                  target: "inscription",
                })
              }
            >
              ◇ Weathered epitaph
            </button>
            {snapshot.corpses.map((c) => (
              <button
                key={c.id}
                data-world-id={c.id}
                className="nameplate corpse"
                onClick={() => setCorpse(c.id)}
              >
                ◇ {c.name}
                <small>{c.quota} item claim</small>
              </button>
            ))}
          </div>
          <header className="player-frame">
            <div className={`portrait ${me?.guild}`}>
              <div className="portrait-art" aria-hidden="true">
                <img src={`/ui/${me?.guild ?? "knight"}.webp`} alt="" />
              </div>
              <span>{me?.level}</span>
            </div>
            <div className="vitals">
              <div className="player-name">
                {me?.name}
                <small>{title(me?.guild ?? "knight")}</small>
              </div>
              <div className="meter health">
                <i
                  style={{
                    width: `${((me?.hp ?? 0) / (me?.maxHp ?? 1)) * 100}%`,
                  }}
                />
                <span>HEALTH</span>
                <strong>
                  {Math.ceil(me?.hp ?? 0)} <small>/ {me?.maxHp}</small>
                </strong>
              </div>
              <div className={`meter resource ${me?.guild}`}>
                <i style={{ width: `${snapshot.self.resource}%` }} />
                <span>{me?.guild === "knight" ? "RESOLVE" : "HEAT"}</span>
                <strong>
                  {Math.round(snapshot.self.resource)} <small>/ 100</small>
                </strong>
              </div>
              <div className="experience">
                <i
                  style={{
                    width: `${(snapshot.self.xp / snapshot.self.nextLevel) * 100}%`,
                  }}
                />
              </div>
            </div>
          </header>
          <div className="location-title">
            <span className="eyebrow">
              {me?.safe ? "THE CONCORD’S LANTERNS" : "THE FANTASY REALM"}
            </span>
            <h2>
              {me?.z && me.z > 0
                ? me.safe
                  ? "Wayfarer’s Refuge"
                  : "Briar March"
                : "Highcross"}
            </h2>
            <span className="location-sub">
              {me?.z && me.z > 0 ? "The Thirteenth Bell" : "The Briar Gate"}
            </span>
          </div>
          {target &&
            me &&
            canDisplayTarget(target, me) &&
            target.id !== me.id && (
              <section
                className={`target-frame ${target.red > 0 ? "red" : ""}`}
              >
                <div>
                  <span>{target.name}</span>
                  <small>
                    {target.kind === "player"
                      ? target.red > 0
                        ? "OUTLAW PLAYER"
                        : "PLAYER"
                      : target.kind === "wolf"
                        ? "CREATURE"
                        : "RESIDENT"}
                  </small>
                </div>
                <div className="meter health">
                  <i
                    style={{ width: `${(target.hp / target.maxHp) * 100}%` }}
                  />
                  <strong>
                    {Math.ceil(target.hp)} / {target.maxHp}
                  </strong>
                </div>
                {target.cast && (
                  <div className="cast-meter">
                    <i
                      style={{
                        width: `${Math.min(100, ((snapshot.now - target.cast.start) / (target.cast.end - target.cast.start)) * 100)}%`,
                      }}
                    />
                    <span>{target.cast.name}</span>
                  </div>
                )}
                {target.kind === "player" &&
                  target.life === "downed" &&
                  me &&
                  distance(me, target) < 3 && (
                    <button
                      className="revive"
                      onClick={() =>
                        connection.current.send({
                          type: "interact",
                          target: target.id,
                        })
                      }
                    >
                      E · Help them up (4s)
                    </button>
                  )}
              </section>
            )}
          <aside className="right-rail">
            <div className="minimap-frame">
              <span className="north">N</span>
              <svg
                viewBox={`${-(me?.x ?? 0) - 16} ${-(me?.z ?? 0) - 16} 32 32`}
                role="img"
                aria-label="Nearby map, town to the south, Briar March to the north"
              >
                <g transform="scale(-1,1)">
                  <rect
                    x="-30"
                    y="-70"
                    width="60"
                    height="120"
                    fill="#182528"
                  />
                  <rect x="-20" y="0" width="40" height="40" fill="#334746" />
                  <path
                    d="M 0 38 L 0 -17 M 0 -23 Q -3 -35 2 -58"
                    stroke="#8c8262"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    d="M -20 -20 L 20 -20"
                    stroke="#487f89"
                    strokeWidth="5"
                  />
                  <path
                    d="M 0 -16 L 0 -24 M 15 -16 L 15 -24"
                    stroke="#b8a377"
                    strokeWidth="3"
                  />
                  <path
                    d="M -20 0 L 20 0"
                    stroke="#8abeb5"
                    strokeWidth=".18"
                    strokeDasharray=".5 .4"
                  />
                  <circle cx={REFUGE.x} cy={-REFUGE.z} r={4} fill="#526753" />
                  <circle
                    cx={NPCS.inscription.x}
                    cy={-NPCS.inscription.z}
                    r=".65"
                    fill="#d7b571"
                  />
                  {snapshot.actors
                    .filter((a) => a.life !== "dead")
                    .map((a) => (
                      <circle
                        key={a.id}
                        cx={a.x}
                        cy={-a.z}
                        r={a.id === me?.id ? 0.65 : 0.42}
                        fill={
                          a.id === me?.id
                            ? "#f7e5b5"
                            : a.red > 0
                              ? "#e45c4b"
                              : a.kind === "wolf"
                                ? "#a86d58"
                                : "#97c8c0"
                        }
                      />
                    ))}
                </g>
              </svg>
              <span className="map-coordinates">
                {Math.round(me?.x ?? 0)} · {Math.round(me?.z ?? 0)}
              </span>
            </div>
            <div className={`safety ${me?.safe ? "safe" : "open"}`}>
              <span>{me?.safe ? "◇" : "⚔"}</span>
              <div>
                <strong>
                  {me?.safe
                    ? me.red > 0
                      ? "SAFE FROM PLAYERS"
                      : me.z > 0
                        ? "SAFE REFUGE"
                        : "SAFE TOWN"
                    : "OPEN PVP"}
                </strong>
                <small>
                  {me?.safe
                    ? me.red > 0
                      ? me.z > 0
                        ? "Unpatrolled sanctuary"
                        : "GUARDS HOSTILE"
                      : "The Concord protects this place"
                    : "One item at risk · two if red"}
                </small>
              </div>
            </div>
            <section className="quest">
              <p className="eyebrow">◇ THE MISSING HOUR</p>
              <h3>The Thirteenth Bell</h3>
              <p>
                {snapshot.self.quest === "unheard"
                  ? "Speak to Mara by the north gate."
                  : snapshot.self.quest === "accepted"
                    ? "Cross the wooden Briar bridge. Turn left at the ruined arch and copy the bridge keeper’s memorial."
                    : snapshot.self.quest === "inspected"
                      ? "Bring Elian Voss’s name and the copied inscription back to Mara at the north gate."
                      : "Mara matched your evidence to her father’s ledger. The Watch will investigate the bridge at dusk. Your reward is in your inventory."}
              </p>
              <small>
                {snapshot.self.quest === "complete"
                  ? "EXPEDITION COMPLETE"
                  : "JOURNEY 01 · THE BRIDGE KEEPER"}
              </small>
            </section>
          </aside>
          {me && me.red > 0 && (
            <div className="outlaw-banner">
              <span>⚔</span>
              <div>
                <strong>
                  {me.killer ? "PLAYER KILLER" : "AGGRESSOR"} · {clock(me.red)}
                </strong>
                <small>
                  Guards pursue you · merchants refuse service · two items at
                  risk
                </small>
              </div>
            </div>
          )}
          <section className="chat-log" aria-label="Journey log">
            <div>
              <span>JOURNEY</span>
              <small>
                {snapshot.population} traveller
                {snapshot.population === 1 ? "" : "s"} nearby
              </small>
            </div>
            {log.slice(-3).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </section>
          {toast && (
            <div className="toast" role="status">
              {toast}
            </div>
          )}
          {(nearest || clueNear) && !dialogue && !panel && (
            <button
              className="interact"
              onClick={() =>
                connection.current.send({
                  type: "interact",
                  target: clueNear ? "inscription" : nearest!.id,
                })
              }
            >
              <kbd>E</kbd>
              {clueNear
                ? "Examine the epitaph"
                : `Speak to ${nearest!.name.split(" ·")[0]}`}
            </button>
          )}
          {snapshot.self.channel && (
            <div className="channel">
              <span>{snapshot.self.channel.name}</span>
              <i
                style={{
                  width: `${((snapshot.now - snapshot.self.channel.start) / (snapshot.self.channel.end - snapshot.self.channel.start)) * 100}%`,
                }}
              />
            </div>
          )}
          {!!me?.controlRemaining && (
            <div className="control-status" role="status">
              {me.stunned ? "HELD" : ""} · {me.controlRemaining.toFixed(1)}s{" "}
              <span>Press C to break free</span>
            </div>
          )}
          <nav className="action-bar" aria-label="Abilities">
            {kit
              .filter((a) => a.key !== "basic")
              .map((a) => {
                const remaining = Math.max(
                  0,
                  (snapshot.self.cooldowns[a.key] ?? 0) - snapshot.now,
                );
                return (
                  <button
                    key={a.key}
                    aria-label={a.name}
                    onClick={() => useAbility(a.key)}
                    className={`${remaining ? "cooldown" : ""} ${a.key === "q" || a.key === "space" || a.key === "c" ? "utility" : ""}`}
                    disabled={remaining > 0 || me?.life !== "alive"}
                    title={`${a.name} · ${a.description}`}
                  >
                    <Icon index={a.icon} />
                    {a.key === "space" && (
                      <span className="charge-count">
                        {snapshot.self.evadeCharges}
                      </span>
                    )}
                    {remaining > 0 && (
                      <span className="cooldown-number">
                        {Math.ceil(remaining)}
                      </span>
                    )}
                    <kbd>
                      {a.key === "space" ? "SPACE" : a.key.toUpperCase()}
                    </kbd>
                    <span className="ability-tip">
                      <strong>{a.name}</strong>
                      {a.description}
                    </span>
                  </button>
                );
              })}
            <p className="combat-hint">
              Select a target · hold <kbd>F</kbd> to attack · <kbd>W A S D</kbd>{" "}
              to move
            </p>
          </nav>
          <nav className="utility-bar">
            <button
              onClick={() =>
                setPanel(panel === "inventory" ? null : "inventory")
              }
              title="Inventory · I"
              aria-label="Inventory"
            >
              <Icon index={14} />
              <kbd>I</kbd>
            </button>
            <button
              onClick={() => setPanel(panel === "guilds" ? null : "guilds")}
              title="Guild codex · G"
              aria-label="Guild codex"
            >
              <Icon index={15} />
              <kbd>G</kbd>
            </button>
            <button onClick={() => setPanel("settings")} aria-label="Settings">
              ⚙
            </button>
            <button onClick={() => setHelp(true)} aria-label="Controls">
              ?
            </button>
            <span>
              {snapshot.self.marks} <small>MARKS</small>
            </span>
          </nav>
          {status !== "Connected" && (
            <div className="connection-banner" role="alert">
              {status}
              <button onClick={() => void enter()}>Reconnect</button>
            </div>
          )}
          {me && me.life !== "alive" && (
            <div className="death-overlay">
              <div>
                <span className="eyebrow">
                  {me.life === "downed"
                    ? "THE WORLD HAS NOT LET GO"
                    : "YOUR JOURNEY CONTINUES"}
                </span>
                <h2>
                  {me.life === "downed"
                    ? "You are downed."
                    : "You have fallen."}
                </h2>
                <p>
                  {me.life === "downed"
                    ? "Crawl with WASD. Another traveller can help you up with E. You remain vulnerable until revived."
                    : `${me.red > 0 ? "Two" : "One"} eligible item${me.red > 0 ? "s" : ""} may be claimed after a player kill. Your starter set is protected.`}
                </p>
                {me.life === "dead" && (
                  <button
                    className="primary"
                    onClick={() => connection.current.send({ type: "respawn" })}
                  >
                    Return to {me.red > 0 ? "Wayfarer’s Refuge" : "Highcross"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {dialogue && (
        <div className="modal-shade">
          <section
            className="dialogue panel"
            role="dialog"
            aria-modal="true"
            aria-label={`Conversation with ${dialogue.speaker}`}
          >
            <button
              className="close"
              onClick={() => setDialogue(null)}
              aria-label="Close dialogue"
            >
              ×
            </button>
            <span className="eyebrow">CONVERSATION</span>
            <h2>{dialogue.speaker}</h2>
            <p>{dialogue.text}</p>
            <div className="dialogue-actions">
              {dialogue.speaker === "Nemi" && (
                <button
                  className="primary"
                  disabled={(me?.red ?? 0) > 0}
                  onClick={() => connection.current.send({ type: "buy" })}
                >
                  Buy amber charm · 12 marks
                </button>
              )}
              <button onClick={() => setDialogue(null)}>
                Continue the journey <span>↗</span>
              </button>
            </div>
          </section>
        </div>
      )}
      {panel && snapshot && (
        <div className="modal-shade">
          <section
            className={`panel ${panel}`}
            role="dialog"
            aria-modal="true"
            aria-label={panel}
          >
            <button
              className="close"
              onClick={() => setPanel(null)}
              aria-label="Close panel"
            >
              ×
            </button>
            <span className="eyebrow">
              {me?.name} · LEVEL {me?.level}
            </span>
            <h2>
              {panel === "inventory"
                ? "What you carry"
                : panel === "guilds"
                  ? "Twelve ways to belong"
                  : "Make yourself at home"}
            </h2>
            {panel === "inventory" && (
              <>
                <p className="panel-intro">
                  Ordinary carried and equipped items can be claimed after a
                  player kill. Your basic starter set is protected.
                </p>
                <div className="inventory-grid">
                  {snapshot.self.inventory.map((item) => (
                    <div
                      className={`inventory-item ${item.protected ? "protected" : ""}`}
                      key={item.id}
                    >
                      <Icon
                        index={
                          item.icon === "blade"
                            ? 0
                            : item.icon === "armour"
                              ? 13
                              : 14
                        }
                      />
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.protected
                            ? "◇ PROTECTED STARTER"
                            : item.slot
                              ? `EQUIPPED · ${item.slot.toUpperCase()}`
                              : "ELIGIBLE FOR PVP LOOT"}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
                {snapshot.self.held.length > 0 && (
                  <p className="warning">
                    In corpse escrow:{" "}
                    {snapshot.self.held.map((i) => i.name).join(", ")}.
                    Unclaimed items return after the claim window.
                  </p>
                )}
                <footer>
                  {snapshot.self.inventory.length} / 40 slots{" "}
                  <span>{snapshot.self.marks} copper marks</span>
                </footer>
              </>
            )}
            {panel === "guilds" && (
              <>
                <p className="panel-intro">
                  All twelve guilds belong in THREEFOLD. This checkpoint offers
                  the Knight and Cyborg practice loadouts.
                </p>
                <div className="guild-grid">
                  {GUILDS.map(([id, g, resource, motto, color], i) => (
                    <button
                      key={id}
                      className={me?.guild === id ? "chosen" : ""}
                      style={{ "--guild-color": color } as React.CSSProperties}
                      onClick={() => {
                        if (id === "knight" || id === "cyborg")
                          connection.current.send({ type: "guild", guild: id });
                        else
                          setToast(
                            `${g}: visual identity established; playable kit belongs to the later guild stage.`,
                          );
                      }}
                    >
                      <span className="guild-symbol">
                        {
                          [
                            "♜",
                            "ϟ",
                            "☽",
                            "✧",
                            "◉",
                            "☼",
                            "♬",
                            "❖",
                            "✺",
                            "◈",
                            "❧",
                            "⬡",
                          ][i]
                        }
                      </span>
                      <div>
                        <strong>{g}</strong>
                        <small>{motto}</small>
                        <em>
                          {id === "knight" || id === "cyborg"
                            ? `${resource.toUpperCase()} · PRACTICE LOADOUT`
                            : "CONCEPT · FULL GUILD STAGE"}
                        </em>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="muted">
                  Change practice loadout in town, while clean and out of
                  combat. Progress and possessions stay with you.
                </p>
              </>
            )}
            {panel === "settings" && (
              <div className="settings-list">
                <button
                  onClick={() => {
                    sound.current.toggle();
                    setMuted(!sound.current.enabled);
                  }}
                >
                  Sound <strong>{muted ? "Muted" : "Enabled"}</strong>
                </button>
                <button
                  onClick={() => {
                    setLow(!low);
                    scene.current?.quality(!low);
                  }}
                >
                  Rendering <strong>{low ? "Low" : "Medium"}</strong>
                </button>
                <button onClick={() => setHelp(true)}>
                  Controls <strong>View bindings →</strong>
                </button>
                <p className="muted">
                  {BUILD} · WebGL2 browser checkpoint
                  <br />
                  Local identities and saves. External multiplayer deployment is
                  a later stage.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
      {corpseView && snapshot && (
        <div className="modal-shade">
          <section
            className="panel corpse-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Corpse item claim"
          >
            <button
              className="close"
              onClick={() => setCorpse(null)}
              aria-label="Close corpse"
            >
              ×
            </button>
            <span className="eyebrow">A CLAIM, NOT A REWARD</span>
            <h2>{corpseView.name}</h2>
            <p>
              {corpseView.quota} item{corpseView.quota === 1 ? "" : "s"}{" "}
              remaining · {clock(corpseView.expires - snapshot.now)} before
              return
            </p>
            <p className="muted">
              Choose an item within three metres. Remain still for three
              seconds; taking damage interrupts the claim.
            </p>
            {corpseView.items.length ? (
              corpseView.items.map((item) => (
                <button
                  className="loot-item"
                  key={item.id}
                  onClick={() =>
                    connection.current.send({
                      type: "claim",
                      corpse: corpseView.id,
                      item: item.id,
                    })
                  }
                  disabled={
                    corpseView.owner !== null &&
                    corpseView.owner !== snapshot.self.id
                  }
                >
                  <Icon index={14} />
                  <span>{item.name}</span>
                  <small>Claim →</small>
                </button>
              ))
            ) : (
              <p>Move closer to inspect the available items.</p>
            )}
          </section>
        </div>
      )}
      {help && (
        <div className="modal-shade">
          <section className="panel controls">
            <button
              className="close"
              onClick={() => setHelp(false)}
              aria-label="Close controls"
            >
              ×
            </button>
            <span className="eyebrow">THE ROAD AHEAD</span>
            <h2>Find your footing</h2>
            <dl>
              <dt>W A S D / arrows</dt>
              <dd>Move relative to the camera</dd>
              <dt>Right click ground</dt>
              <dd>Walk toward a point</dd>
              <dt>Click a character / Tab</dt>
              <dd>Select / cycle nearby creatures</dd>
              <dt>Hold F</dt>
              <dd>Repeat your basic attack</dd>
              <dt>1–5 · R</dt>
              <dd>Abilities · signature</dd>
              <dt>Q · Space · C</dt>
              <dd>Guild defence · evade · break free</dd>
              <dt>E</dt>
              <dd>Speak, examine or inspect a corpse</dd>
              <dt>I · G</dt>
              <dd>Inventory · guild codex</dd>
              <dt>[ · ] · mouse wheel</dt>
              <dd>Rotate · zoom</dd>
              <dt>Escape</dt>
              <dd>Close panels and stop actions</dd>
            </dl>
            <p className="warning">
              Beyond towns and marked refuges, PvP is always active. Starting an
              unlawful attack turns your name red.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              I’m ready
            </button>
          </section>
        </div>
      )}
    </>
  );
}
