// @refresh reset
import React, { useEffect, useRef, useState } from "react";
import {
  BUILD,
  GUILDS,
  KITS,
  distance,
  type Ability,
  type AbilityKey,
  type ActorView,
  type CombatEvent,
  type Guild,
  type Notice,
  type Snapshot,
  type Vec2,
} from "../../../packages/contracts/game";
import { NPCS } from "../../../packages/simulation/map";
import {
  createConnection,
  preferredMode,
  type ConnectionMode,
  type GameConnection,
  type Intent,
} from "./network";
import { GameScene } from "./scene";
import { LocalConnection, SoloBusyError } from "./local-world";
import { Soundscape } from "./audio";
import { FieldLab } from "./FieldLab";
import { Minimap } from "./Minimap";
import { canDisplayTarget } from "./combat-presentation";
import {
  abilityIcon,
  guildColor,
  guildEmblem,
  itemIcon,
  portrait,
  uiIcon,
  type PortraitKind,
} from "./pixel-art";
import "./style.css";

type Quality = "low" | "medium" | "high";
const QUALITIES: readonly Quality[] = ["low", "medium", "high"];
type Handlers = {
  snapshot: (s: Snapshot) => void;
  notice: (n: Notice) => void;
  status: (text: string) => void;
};

const QUALITY_KEY = "threefold-quality",
  DAY_CYCLE_KEY = "threefold-day-cycle";
const readPref = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows may refuse storage; the setting still applies this session.
  }
};
const storedQuality = (): Quality | null => {
  const q = readPref(QUALITY_KEY);
  return q === "low" || q === "medium" || q === "high" ? q : null;
};

const clock = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;
const title = (guild: Guild) => (guild === "knight" ? "Knight" : "Cyborg");
const keyLabel = (key: AbilityKey) =>
  key === "space" ? "SPACE" : key.toUpperCase();
const portraitFor = (a: ActorView): PortraitKind =>
  a.kind === "player" ? a.guild : a.kind;
const speakerArt = (speaker?: string) =>
  speaker === "Mara"
    ? portrait("mara")
    : speaker === "Nemi"
      ? portrait("merchant")
      : speaker === "Concord Watch"
        ? portrait("guard")
        : uiIcon("book");
const costLabel = (guild: Guild, a: Ability) =>
  !a.cost
    ? "Free"
    : guild === "knight"
      ? `${a.cost} Resolve`
      : `${a.cost > 0 ? "+" : "−"}${Math.abs(a.cost)} Heat`;
const GUILD_BLURB: Record<Guild, [string, string]> = {
  knight: ["Blade & resolve", "Guard, interrupt, protect"],
  cyborg: ["Pulse & heat", "Aim, overclock, vent"],
};
const MODES: [ConnectionMode, string, string][] = [
  ["solo", "Solo", "Plays entirely in this browser"],
  ["server", "Multiplayer", "Local server"],
];
/** 0 midnight · 0.25 sunrise · 0.5 noon · 0.75 sunset. */
const dayClock = (phase: number) => {
  const minutes = Math.floor((((phase % 1) + 1) % 1) * 24 * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
};

/** A crisp pixel-art sprite. Decorative: meaning always lives in nearby text. */
function Px({ src, className = "" }: { src: string; className?: string }) {
  return (
    <img
      className={`px ${className}`}
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

/** Arrow keys move the choice within a radiogroup, like native radio buttons. */
function radioKeys<T>(
  options: readonly T[],
  current: T,
  choose: (value: T) => void,
) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const index = options.indexOf(current);
    const next = (index + step + options.length) % options.length;
    choose(options[next]);
    const radios =
      e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[next]?.focus();
  };
}

/** Combat text for one confirmed event, or null when it is not worth a pop. */
function combatText(
  e: CombatEvent,
  self: string,
): { text: string; tone: string; blocked?: boolean } | null {
  const involved = e.source === self || e.target === self;
  if (e.type === "hit" && e.amount > 0)
    return {
      text: String(e.amount),
      tone: e.target === self ? "taken" : e.source === self ? "dealt" : "other",
      blocked: e.blocked,
    };
  if (e.type === "heal" && e.amount > 0)
    return { text: `+${e.amount}`, tone: involved ? "heal" : "heal other" };
  if (e.type === "miss" && involved)
    return { text: "MISS", tone: e.target === self ? "miss dodged" : "miss" };
  if (e.type === "dodge" && e.key === "c" && e.target === self)
    return { text: "FREE!", tone: "miss free" };
  return null;
}

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    scene = useRef<GameScene | null>(null),
    handlers = useRef<Handlers>({
      snapshot: () => {},
      notice: () => {},
      status: () => {},
    }),
    sound = useRef(new Soundscape());
  const wire = (c: GameConnection) => {
    c.onSnapshot = (s) => handlers.current.snapshot(s);
    c.onNotice = (n) => handlers.current.notice(n);
    c.onStatus = (text) => handlers.current.status(text);
    return c;
  };
  const [initialConnection] = useState(() =>
    wire(createConnection(preferredMode(location.search))),
  );
  const connection = useRef<GameConnection>(initialConnection);
  const snap = useRef<Snapshot | null>(null),
    keys = useRef(new Set<string>()),
    targetRef = useRef(""),
    destination = useRef<Vec2 | null>(null),
    lastLife = useRef<ActorView["life"] | undefined>(undefined),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    blocked = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selected, setSelected] = useState(""),
    [progress, setProgress] = useState("Opening the Briar Gate…"),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [joining, setJoining] = useState(false),
    [joinError, setJoinError] = useState(""),
    [confirmFresh, setConfirmFresh] = useState(false),
    [mode, setMode] = useState<ConnectionMode>(initialConnection.mode);
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
    [quality, setQualityState] = useState<Quality>(
      () => storedQuality() ?? "medium",
    ),
    [dayCycle, setDayCycleState] = useState(
      () => readPref(DAY_CYCLE_KEY) !== "off",
    ),
    [help, setHelp] = useState(false),
    [corpse, setCorpse] = useState<string | null>(null),
    [logOpen, setLogOpen] = useState(false);
  /** One toast at a time; a newer toast restarts the four-second timer. */
  const showToast = (text: string) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  };
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
      .then(() => {
        const q = storedQuality();
        if (q) renderer.setQuality(q);
        if (readPref(DAY_CYCLE_KEY) === "off") renderer.setDayCycle(false);
        setReady(true);
      })
      .catch((error) => {
        setProgress(`The scene could not load: ${String(error)}`);
      });
    handlers.current = {
      snapshot: (s) => {
        snap.current = s;
        setSnapshot(s);
        renderer.setSnapshot(s);
        sound.current.orient(renderer.camera.alpha);
        sound.current.events(s.events, s.actors, s.self.id);
        const p = s.actors.find((a) => a.id === s.self.id);
        sound.current.zone(Boolean(p && !p.safe));
        // Falling, being revived or respawning drops any click-to-move target.
        if (p && p.life !== lastLife.current) destination.current = null;
        lastLife.current = p?.life;
      },
      notice: (n) => {
        setLog((lines) => [
          ...lines.slice(-19),
          `${n.speaker ? n.speaker + ": " : ""}${n.text}`,
        ]);
        if (n.kind === "dialogue") setDialogue(n);
        else showToast(n.text);
      },
      status: setStatus,
    };
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
    // Dev/capture hook: ordinary player intents through the same connection
    // the keyboard uses. Only on loopback hosts or with ?lab=1.
    const devHost =
      ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname) ||
      new URLSearchParams(location.search).has("lab");
    Object.defineProperty(window, "__THREEFOLD__", {
      configurable: true,
      value: {
        snapshot: () => snap.current,
        metrics: () => renderer.metrics(),
        build: BUILD,
        get mode() {
          return connection.current.mode;
        },
        ...(devHost
          ? {
              send: (intent: Intent) => connection.current.send(intent),
              select: (id: string) => select(id),
              renderer,
            }
          : {}),
      },
    });
    return () => {
      clearInterval(interval);
      clearTimeout(toastTimer.current);
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
  /** Swap the world host before joining; the old one is closed first. */
  const changeMode = (next: ConnectionMode) => {
    if (next === connection.current.mode || snap.current || joining) return;
    connection.current.leave();
    connection.current = wire(createConnection(next));
    setMode(next);
    setStatus("");
    setJoinError("");
    setConfirmFresh(false);
  };
  async function enter() {
    setJoining(true);
    setJoinError("");
    try {
      void sound.current
        .unlock()
        .then(() => setMuted(false))
        .catch(() => setMuted(true));
      await connection.current.join(name, guild);
    } catch (error) {
      const message =
        connection.current.mode === "server"
          ? "Couldn’t reach the local server. Start it with npm run dev, or play solo in this browser."
          : error instanceof SoloBusyError
            ? error.message
            : `The world could not start: ${String(error)}`;
      setStatus(message);
      setJoinError(message);
    } finally {
      setJoining(false);
    }
  }
  const playSolo = () => {
    changeMode("solo");
    void enter();
  };
  /** Sets the solo save aside (never deletes it) and enters a new world. */
  async function startNewSoloWorld() {
    setConfirmFresh(false);
    const solo = connection.current;
    if (!(solo instanceof LocalConnection) || joining) return;
    setJoining(true);
    setJoinError("");
    try {
      await solo.startFresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `The solo world could not be set aside: ${String(error)}`;
      setStatus(message);
      setJoinError(message);
      setJoining(false);
      return;
    }
    await enter();
  }
  const changeQuality = (level: Quality) => {
    setQualityState(level);
    writePref(QUALITY_KEY, level);
    scene.current?.setQuality(level);
  };
  const changeDayCycle = (enabled: boolean) => {
    setDayCycleState(enabled);
    writePref(DAY_CYCLE_KEY, enabled ? "on" : "off");
    scene.current?.setDayCycle(enabled);
  };
  const setSound = (enabled: boolean) => {
    if (sound.current.enabled !== enabled) sound.current.toggle();
    setMuted(!sound.current.enabled);
  };
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
  const levelUp = snapshot?.events.find(
    (e) =>
      e.type === "level" &&
      e.target === snapshot.self.id &&
      snapshot.now - e.at < 2,
  );
  const hasTarget = Boolean(
    target && me && target.id !== me.id && canDisplayTarget(target, me),
  );
  const phase = scene.current?.dayPhase ?? 0.4;
  const night = phase < 0.23 || phase > 0.77;
  const shownStatus = status || progress;
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
            <h1 aria-label="THREEFOLD">
              {[..."THREEFOLD"].map((letter, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className={`logo-letter realm-${i % 3}`}
                  style={{ "--i": i } as React.CSSProperties}
                >
                  {letter}
                </span>
              ))}
            </h1>
            <p className="tagline">
              <span className="realm-0">FANTASY</span>
              <i>·</i>
              <span className="realm-1">SCIENCE</span>
              <i>·</i>
              <span className="realm-2">CHAOS</span>
            </p>
            <p className="subtitle">A world between worlds</p>
          </div>
          <section className="arrival-card" aria-label="Begin your expedition">
            <p className="eyebrow">YOUR FIRST EXPEDITION</p>
            <h2>The Briar Gate</h2>
            {!joinError && (
              <p className="arrival-copy">
                The thirteenth bell has sounded. Beyond the lanterns, the road
                remembers.
              </p>
            )}
            <label className="field-label" htmlFor="traveller">
              Your traveller’s name
            </label>
            <input
              id="traveller"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="field-label" id="guild-label">
              Choose your guild
            </p>
            <div
              className="class-choice"
              role="group"
              aria-labelledby="guild-label"
            >
              {(["knight", "cyborg"] as Guild[]).map((g) => (
                <button
                  key={g}
                  className={`guild-tile ${g} ${guild === g ? "chosen" : ""}`}
                  onClick={() => setGuild(g)}
                  aria-pressed={guild === g}
                >
                  <span className="tile-portrait">
                    <Px src={portrait(g)} />
                  </span>
                  <span className="tile-text">
                    <strong>{title(g)}</strong>
                    <small>{GUILD_BLURB[g][0]}</small>
                    <em>{GUILD_BLURB[g][1]}</em>
                  </span>
                </button>
              ))}
            </div>
            <p className="field-label" id="mode-label">
              How to play
            </p>
            <div
              className="mode-choice"
              role="radiogroup"
              aria-labelledby="mode-label"
              onKeyDown={radioKeys(
                MODES.map(([m]) => m),
                mode,
                changeMode,
              )}
            >
              {MODES.map(([m, label, hint]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  tabIndex={mode === m ? 0 : -1}
                  className={mode === m ? "chosen" : ""}
                  disabled={joining}
                  onClick={() => changeMode(m)}
                >
                  <Px src={uiIcon(m === "solo" ? "heart" : "swords")} />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="mode-hint">
              {mode === "solo"
                ? "Your progress is kept in this browser. No server needed."
                : "Requires npm run dev. Open several tabs for open PvP between travellers."}
            </p>
            <button
              className="primary enter"
              disabled={!ready || joining || !name.trim()}
              onClick={() => void enter()}
            >
              <span>
                {joining
                  ? "Entering…"
                  : ready
                    ? "Enter Highcross"
                    : "Preparing the world…"}
              </span>
              <Px src={uiIcon("sparkle")} />
            </button>
            <p
              className={`loading-copy ${joinError ? "error" : ""}`}
              role="status"
            >
              {!ready && !joinError && <span className="spinner" />}
              {shownStatus}
            </p>
            {joinError && mode === "server" && (
              <button className="secondary solo-fallback" onClick={playSolo}>
                <Px src={uiIcon("heart")} />
                Play solo instead
              </button>
            )}
            {mode === "solo" &&
              (confirmFresh ? (
                // In-page, since sandboxed hosts can silently refuse confirm().
                <div
                  className="fresh-confirm"
                  role="group"
                  aria-labelledby="fresh-confirm-copy"
                >
                  <p id="fresh-confirm-copy">
                    Start a new solo world? Your current one is kept as a backup
                    in this browser, not deleted.
                  </p>
                  <div>
                    <button
                      className="secondary"
                      autoFocus
                      onClick={() => setConfirmFresh(false)}
                    >
                      Keep my world
                    </button>
                    <button
                      className="secondary"
                      disabled={!ready || joining || !name.trim()}
                      onClick={() => void startNewSoloWorld()}
                    >
                      Start new world
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="secondary fresh-world"
                  disabled={!ready || joining}
                  onClick={() => setConfirmFresh(true)}
                >
                  Start a new solo world
                </button>
              ))}
            <p className="checkpoint-note">
              Playable development checkpoint · two practice guilds. The
              complete game includes all twelve.
            </p>
          </section>
          <div className="entrance-bottom">
            <span>An original realm inspired by 3 Kingdoms MUD</span>
            <span>Headphones recommended</span>
          </div>
        </main>
      ) : (
        <>
          <div className="world-labels" aria-label="Nearby characters">
            {snapshot.events
              .filter((e) => snapshot.now - e.at < 1.1)
              .map((e) => {
                const pop = combatText(e, snapshot.self.id);
                if (!pop) return null;
                return (
                  <span
                    key={e.id}
                    data-world-id={`event-${e.id}`}
                    className={`combat-number ${pop.tone} ${pop.blocked ? "blocked" : ""}`}
                    style={
                      { "--jitter": (e.id % 5) - 2 } as React.CSSProperties
                    }
                  >
                    <b>
                      {pop.blocked && (
                        <em>
                          <Px src={uiIcon("shield")} />
                          BLOCK
                        </em>
                      )}
                      {pop.text}
                    </b>
                  </span>
                );
              })}
            {snapshot.actors
              .filter((a) => !me || canDisplayTarget(a, me))
              .map((a) => (
                <button
                  key={a.id}
                  data-world-id={a.id}
                  className={`nameplate ${a.red > 0 ? "outlaw" : ""} ${selected === a.id ? "selected" : ""} ${a.id === snapshot.self.id ? "self" : ""} ${a.kind === "wolf" ? "creature" : ""}`}
                  onClick={() => select(a.id)}
                  aria-label={`Target ${a.name}`}
                >
                  <span className="tag">
                    {a.red > 0 && <Px src={uiIcon("swords")} />}
                    {a.name}
                    {a.kind === "player" && a.id !== snapshot.self.id ? (
                      <small>PLAYER</small>
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
              <span className="tag">
                <Px src={uiIcon("book")} />
                Weathered epitaph
              </span>
            </button>
            {snapshot.corpses.map((c) => (
              <button
                key={c.id}
                data-world-id={c.id}
                className="nameplate corpse"
                onClick={() => setCorpse(c.id)}
              >
                <span className="tag">
                  <Px src={uiIcon("bag")} />
                  {c.name}
                </span>
                <small>{c.quota} item claim</small>
              </button>
            ))}
          </div>
          {me && me.life === "alive" && me.hp / me.maxHp < 0.3 && (
            <div className="low-health" aria-hidden="true" />
          )}
          <header className="player-frame">
            <div className={`portrait ${me?.guild ?? "knight"}`}>
              <Px src={portrait(me?.guild ?? "knight")} />
              <span className="level-badge" aria-label={`Level ${me?.level}`}>
                {me?.level}
              </span>
            </div>
            <div className="vitals">
              <div className="player-name">
                <span>{me?.name}</span>
                <small className={`guild-chip ${me?.guild}`}>
                  {title(me?.guild ?? "knight")}
                </small>
              </div>
              <div className="meter health">
                <i
                  style={{
                    width: `${((me?.hp ?? 0) / (me?.maxHp ?? 1)) * 100}%`,
                  }}
                />
                <span>
                  <Px src={uiIcon("heart")} />
                  HEALTH
                </span>
                <strong>
                  {Math.ceil(me?.hp ?? 0)} <small>/ {me?.maxHp}</small>
                </strong>
              </div>
              <div className={`meter resource ${me?.guild}`}>
                <i
                  style={{
                    width: `${snapshot.self.resource}%`,
                    backgroundSize: `${10000 / Math.max(1, snapshot.self.resource)}% 100%`,
                  }}
                />
                <span>{me?.guild === "knight" ? "RESOLVE" : "HEAT"}</span>
                <strong>
                  {Math.round(snapshot.self.resource)} <small>/ 100</small>
                </strong>
              </div>
              <div
                className="experience"
                role="img"
                aria-label={`Experience ${snapshot.self.xp} of ${snapshot.self.nextLevel}`}
              >
                <span>XP</span>
                <div>
                  <i
                    style={{
                      width: `${(snapshot.self.xp / snapshot.self.nextLevel) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </header>
          <div className={`location-title ${hasTarget ? "has-target" : ""}`}>
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
          {target && me && hasTarget && (
            <section
              className={`target-frame ${target.red > 0 ? "red" : ""} ${target.kind === "wolf" ? "creature" : ""}`}
            >
              <div className="target-portrait">
                <Px src={portrait(portraitFor(target))} />
              </div>
              <div className="target-body">
                <div className="target-name">
                  <span>{target.name}</span>
                  <small>
                    {target.kind === "player"
                      ? target.red > 0
                        ? "OUTLAW PLAYER"
                        : "PLAYER"
                      : target.kind === "wolf"
                        ? "CREATURE"
                        : "RESIDENT"}{" "}
                    · LV {target.level}
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
                      <kbd>E</kbd> Help them up (4s)
                    </button>
                  )}
              </div>
            </section>
          )}
          <aside className="right-rail">
            <div className="minimap-frame">
              <span className="north" aria-hidden="true">
                N
              </span>
              {me && <Minimap me={me} snapshot={snapshot} />}
              <span className="map-chip day-chip" title="Time of day">
                <Px src={uiIcon(night ? "moon" : "sun")} />
                {dayClock(phase)}
              </span>
              <span className="map-chip map-coordinates">
                {Math.round(me?.x ?? 0)} · {Math.round(me?.z ?? 0)}
              </span>
            </div>
            <div
              className={`safety ${me?.safe ? "safe" : "open"}`}
              aria-live="polite"
            >
              <span className="safety-icon">
                <Px src={uiIcon(me?.safe ? "shield" : "swords")} />
              </span>
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
              <Px src={uiIcon("map")} className="quest-icon" />
              <p className="eyebrow">THE MISSING HOUR</p>
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
            <div className="outlaw-banner" role="status">
              <Px src={uiIcon("swords")} />
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
          <section
            className={`chat-log ${logOpen ? "expanded" : ""}`}
            aria-label="Journey log"
          >
            <div>
              <button
                className="log-toggle"
                aria-expanded={logOpen}
                onClick={() => setLogOpen(!logOpen)}
              >
                <Px src={uiIcon("book")} />
                Journey {logOpen ? "−" : "+"}
              </button>
              <small>
                {snapshot.population} traveller
                {snapshot.population === 1 ? "" : "s"} nearby
              </small>
            </div>
            {(logOpen ? log.slice(-5) : log.slice(-1)).map((line, i) => (
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
              <i
                style={{
                  width: `${((snapshot.now - snapshot.self.channel.start) / (snapshot.self.channel.end - snapshot.self.channel.start)) * 100}%`,
                }}
              />
              <span>{snapshot.self.channel.name}</span>
            </div>
          )}
          {!!me?.controlRemaining && (
            <div className="control-status" role="status">
              <strong>
                {me.stunned ? "HELD" : "ROOTED"} ·{" "}
                {me.controlRemaining.toFixed(1)}s
              </strong>
              <span>
                Press <kbd>C</kbd> to break free
              </span>
            </div>
          )}
          {levelUp && me && (
            <div className="level-up" key={levelUp.id} role="status">
              <Px src={uiIcon("sparkle")} className="burst left" />
              <div>
                <strong>LEVEL UP!</strong>
                <small>You reached level {me.level}</small>
              </div>
              <Px src={uiIcon("sparkle")} className="burst right" />
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
                const utility =
                  a.key === "q" || a.key === "space" || a.key === "c";
                const kitGuild = me?.guild ?? guild;
                return (
                  <button
                    key={a.key}
                    aria-label={a.name}
                    aria-describedby={`tip-${a.key}`}
                    onClick={() => useAbility(a.key)}
                    className={`slot ${remaining ? "cooldown" : ""} ${utility ? "utility" : ""} ${a.key === "r" ? "signature" : ""}`}
                    disabled={remaining > 0 || me?.life !== "alive"}
                  >
                    <Px
                      src={abilityIcon(kitGuild, a.key)}
                      className="slot-icon"
                    />
                    {remaining > 0 && (
                      <span
                        className="cooldown-sweep"
                        style={
                          {
                            "--cd": Math.min(1, remaining / a.cooldown),
                          } as React.CSSProperties
                        }
                      />
                    )}
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
                    <kbd>{keyLabel(a.key)}</kbd>
                    <span
                      className="ability-tip"
                      role="tooltip"
                      id={`tip-${a.key}`}
                    >
                      <strong>
                        {a.name}
                        <kbd>{keyLabel(a.key)}</kbd>
                      </strong>
                      <span className="tip-stats">
                        <span>{a.cooldown}s cooldown</span>
                        <span>{costLabel(kitGuild, a)}</span>
                      </span>
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
          <nav className="utility-bar" aria-label="Menus">
            <button
              onClick={() =>
                setPanel(panel === "inventory" ? null : "inventory")
              }
              title="Inventory · I"
              aria-label="Inventory"
            >
              <Px src={uiIcon("bag")} />
              <kbd>I</kbd>
            </button>
            <button
              onClick={() => setPanel(panel === "guilds" ? null : "guilds")}
              title="Guild codex · G"
              aria-label="Guild codex"
            >
              <Px src={uiIcon("book")} />
              <kbd>G</kbd>
            </button>
            <button
              onClick={() => setPanel("settings")}
              title="Settings"
              aria-label="Settings"
            >
              <Px src={uiIcon("gear")} />
            </button>
            <button
              onClick={() => setHelp(true)}
              title="Controls · H"
              aria-label="Controls"
            >
              <Px src={uiIcon("help")} />
              <kbd>H</kbd>
            </button>
            <span className="marks">
              <Px src={uiIcon("coin")} />
              {snapshot.self.marks} <small>MARKS</small>
            </span>
          </nav>
          {status !== "Connected" && (
            <div className="connection-banner" role="alert">
              <span>{status}</span>
              <button onClick={() => void enter()}>Reconnect</button>
            </div>
          )}
          {me && me.life !== "alive" && (
            <div className="death-overlay">
              <div className="death-card">
                <Px
                  src={uiIcon(me.life === "downed" ? "heart" : "skull")}
                  className="death-icon"
                />
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
                    onClick={() => {
                      destination.current = null;
                      connection.current.send({ type: "respawn" });
                    }}
                  >
                    <span>
                      Return to {me.red > 0 ? "Wayfarer’s Refuge" : "Highcross"}
                    </span>
                    <Px src={uiIcon("sparkle")} />
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
            className="dialogue"
            role="dialog"
            aria-modal="true"
            aria-label={`Conversation with ${dialogue.speaker}`}
          >
            <div className="speaker">
              <span className="speaker-portrait">
                <Px src={speakerArt(dialogue.speaker)} />
              </span>
              <span className="speaker-name">{dialogue.speaker}</span>
            </div>
            <div className="bubble">
              <button
                className="close"
                onClick={() => setDialogue(null)}
                aria-label="Close dialogue"
              >
                ×
              </button>
              <span className="eyebrow">CONVERSATION</span>
              <p>{dialogue.text}</p>
              <div className="dialogue-actions">
                {dialogue.speaker === "Nemi" && (
                  <button
                    className="primary small"
                    disabled={(me?.red ?? 0) > 0}
                    onClick={() => connection.current.send({ type: "buy" })}
                  >
                    <Px src={itemIcon("charm")} />
                    <span>Buy amber charm · 12 marks</span>
                  </button>
                )}
                <button className="secondary" onClick={() => setDialogue(null)}>
                  Continue the journey <span aria-hidden="true">→</span>
                </button>
              </div>
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
            <div className="panel-head">
              <Px
                src={uiIcon(
                  panel === "inventory"
                    ? "bag"
                    : panel === "guilds"
                      ? "book"
                      : "gear",
                )}
                className="panel-icon"
              />
              <div>
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
              </div>
            </div>
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
                      <span className="item-tile">
                        <Px src={itemIcon(item.icon)} />
                        {item.protected && (
                          <Px src={uiIcon("shield")} className="item-badge" />
                        )}
                      </span>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.protected
                            ? "PROTECTED STARTER"
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
                  <span>{snapshot.self.inventory.length} / 40 slots</span>
                  <span className="marks">
                    <Px src={uiIcon("coin")} />
                    {snapshot.self.marks} copper marks
                  </span>
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
                  {GUILDS.map(([id, g, resource, motto]) => (
                    <button
                      key={id}
                      className={`${me?.guild === id ? "chosen" : ""} ${id === "knight" || id === "cyborg" ? "playable" : ""}`}
                      style={
                        {
                          "--guild-color": guildColor(id),
                        } as React.CSSProperties
                      }
                      onClick={() => {
                        if (id === "knight" || id === "cyborg")
                          connection.current.send({ type: "guild", guild: id });
                        else
                          showToast(
                            `${g}: visual identity established; playable kit belongs to the later guild stage.`,
                          );
                      }}
                    >
                      <Px src={guildEmblem(id)} className="guild-symbol" />
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
                <div className="setting-row">
                  <span id="set-sound">Sound</span>
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-labelledby="set-sound"
                    onKeyDown={radioKeys([true, false], !muted, setSound)}
                  >
                    {[true, false].map((on) => (
                      <button
                        key={String(on)}
                        role="radio"
                        aria-checked={muted !== on}
                        tabIndex={muted !== on ? 0 : -1}
                        onClick={() => setSound(on)}
                      >
                        {on ? "On" : "Off"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span id="set-quality">Quality</span>
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-labelledby="set-quality"
                    onKeyDown={radioKeys(QUALITIES, quality, changeQuality)}
                  >
                    {QUALITIES.map((level) => (
                      <button
                        key={level}
                        role="radio"
                        aria-checked={quality === level}
                        tabIndex={quality === level ? 0 : -1}
                        onClick={() => changeQuality(level)}
                      >
                        {level[0].toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span id="set-day">Day &amp; night cycle</span>
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-labelledby="set-day"
                    onKeyDown={radioKeys(
                      [true, false],
                      dayCycle,
                      changeDayCycle,
                    )}
                  >
                    {[true, false].map((on) => (
                      <button
                        key={String(on)}
                        role="radio"
                        aria-checked={dayCycle === on}
                        tabIndex={dayCycle === on ? 0 : -1}
                        onClick={() => changeDayCycle(on)}
                      >
                        {on ? "On" : "Off"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="setting-row">
                  <span>Controls</span>
                  <button className="secondary" onClick={() => setHelp(true)}>
                    View bindings →
                  </button>
                </div>
                <p className="muted">
                  {BUILD} · WebGL2 browser checkpoint ·{" "}
                  {mode === "solo" ? "solo world" : "local server"}
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
            <div className="panel-head">
              <Px src={uiIcon("bag")} className="panel-icon" />
              <div>
                <span className="eyebrow">A CLAIM, NOT A REWARD</span>
                <h2>{corpseView.name}</h2>
              </div>
            </div>
            <p className="claim-timer">
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
                  <span className="item-tile">
                    <Px src={itemIcon(item.icon)} />
                  </span>
                  <span>{item.name}</span>
                  <small>Claim →</small>
                </button>
              ))
            ) : (
              <p className="muted">
                Move closer to inspect the available items.
              </p>
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
            <div className="panel-head">
              <Px src={uiIcon("help")} className="panel-icon" />
              <div>
                <span className="eyebrow">THE ROAD AHEAD</span>
                <h2>Find your footing</h2>
              </div>
            </div>
            <dl>
              <dt>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> / arrows
              </dt>
              <dd>Move relative to the camera</dd>
              <dt>Right click ground</dt>
              <dd>Walk toward a point</dd>
              <dt>
                Click a character / <kbd>Tab</kbd>
              </dt>
              <dd>Select / cycle nearby creatures</dd>
              <dt>
                Hold <kbd>F</kbd>
              </dt>
              <dd>Repeat your basic attack</dd>
              <dt>
                <kbd>1</kbd>–<kbd>5</kbd> · <kbd>R</kbd>
              </dt>
              <dd>Abilities · signature</dd>
              <dt>
                <kbd>Q</kbd> · <kbd>Space</kbd> · <kbd>C</kbd>
              </dt>
              <dd>Guild defence · evade · break free</dd>
              <dt>
                <kbd>E</kbd>
              </dt>
              <dd>Speak, examine or inspect a corpse</dd>
              <dt>
                <kbd>I</kbd> · <kbd>G</kbd> · <kbd>H</kbd>
              </dt>
              <dd>Inventory · guild codex · controls</dd>
              <dt>
                <kbd>[</kbd> · <kbd>]</kbd> · mouse wheel
              </dt>
              <dd>Rotate · zoom</dd>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>Close panels and stop actions</dd>
            </dl>
            <p className="warning">
              <Px src={uiIcon("swords")} />
              Beyond towns and marked refuges, PvP is always active. Starting an
              unlawful attack turns your name red.
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              <span>I’m ready</span>
              <Px src={uiIcon("sparkle")} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
