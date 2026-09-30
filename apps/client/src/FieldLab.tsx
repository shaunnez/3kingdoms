import { useEffect, useRef, useState } from "react";
import type { GameScene } from "./scene";
import type { Connection } from "./network";
import {
  distance,
  type Snapshot,
  type Vec2,
} from "../../../packages/contracts/game";
import { saveFrame, recordPlay, saveMetrics } from "./capture";
import { benchmark } from "./benchmark";

type Props = {
  scene: () => GameScene | null;
  connection: Connection;
  snapshot: Snapshot;
  select: (id: string) => void;
  selected: string;
  audioTracks: () => MediaStreamTrack[];
};
/** Explicit local QA surface. Uses the same unprivileged network inputs as a player. */
export function FieldLab({
  scene,
  connection,
  snapshot,
  select,
  selected,
  audioTracks,
}: Props) {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pvp = useRef(false);
  const route = useRef<Vec2[]>([]),
    fight = useRef(false);
  const benchAbort = useRef<AbortController | null>(null),
    elemental = useRef(false),
    hound = useRef(false),
    stress = useRef(false);
  const [status, setStatus] = useState("Field tools ready"),
    [readout, setReadout] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const s = latest.current,
        p = s.actors.find((a) => a.id === s.self.id);
      if (!p || p.life !== "alive") {
        route.current = [];
        return;
      }
      const point = route.current[0];
      if (point) {
        const d = distance(p, point);
        if (d < 0.35) {
          route.current.shift();
          connection.send({ type: "move", x: 0, z: 0 });
          if (!route.current.length) setStatus("Arrived.");
        } else
          connection.send({
            type: "move",
            x: (point.x - p.x) / d,
            z: (point.z - p.z) / d,
          });
      }
      if (fight.current) {
        const target = s.actors
          .filter(
            (a) =>
              a.kind === "wolf" && a.life === "alive" && distance(a, p) < 12,
          )
          .sort((a, b) => distance(a, p) - distance(b, p))[0];
        if (target) {
          select(target.id);
          connection.send({ type: "ability", key: "basic", target: target.id });
          if (p.guild === "knight" && distance(p, target) < 2.5)
            connection.send({ type: "ability", key: "1", target: target.id });
          if (p.guild === "cyborg")
            connection.send({ type: "ability", key: "4", target: target.id });
        }
      }
      if (pvp.current && selectedRef.current)
        connection.send({
          type: "ability",
          key: "basic",
          target: selectedRef.current,
        });
    }, 100);
    const metrics = setInterval(() => {
      const m = scene()?.metrics();
      if (m)
        setReadout(
          `${m.fps.toFixed(1)} fps · ${m.draws} draws · ${(m.triangles / 1000).toFixed(0)}k total triangles · ${m.meshes} meshes${m.studyMotion ? ` · ${m.studyMotion}` : ""}`,
        );
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(metrics);
      benchAbort.current?.abort();
      connection.send({ type: "move", x: 0, z: 0 });
    };
  }, [connection]);
  const travel = (points: Vec2[]) => {
    route.current = points;
    setStatus("Walking through ordinary server movement inputs…");
  };
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(await action());
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };
  const me = snapshot.actors.find((a) => a.id === snapshot.self.id);
  return (
    <aside
      className="field-lab"
      data-capture-ignore="true"
      aria-label="Local checkpoint tools"
    >
      <details open>
        <summary>FIELD LAB · LOCAL CHECKPOINT</summary>
        <p>{readout}</p>
        <p>
          {me?.name} · {me?.x.toFixed(1)}, {me?.z.toFixed(1)} ·{" "}
          {Math.ceil(me?.hp ?? 0)} HP
        </p>
        <div className="lab-buttons">
          <button onClick={() => travel([{ x: -5, z: -10 }])}>
            Walk to Mara
          </button>
          <button
            onClick={() =>
              connection.send({ type: "interact", target: "mara" })
            }
          >
            Talk to Mara
          </button>
          <button
            onClick={() =>
              travel([
                { x: 0, z: -3 },
                { x: 0, z: 7 },
              ])
            }
          >
            Walk through gate
          </button>
          <button
            onClick={() =>
              travel([
                ...(me && me.z < 26 ? [{ x: 0, z: 14 }] : []),
                { x: 0, z: 26 },
                { x: -4, z: 32 },
              ])
            }
          >
            Walk to epitaph
          </button>
          <button
            onClick={() =>
              connection.send({ type: "interact", target: "inscription" })
            }
          >
            Read epitaph
          </button>
          <button
            onClick={() =>
              travel([
                ...(me && me.z < 17 ? [{ x: 0, z: 14 }] : []),
                ...(me && me.z < 35
                  ? [
                      { x: 0, z: 26 },
                      { x: 18, z: 26 },
                    ]
                  : []),
                { x: 18, z: 54 },
              ])
            }
          >
            Walk to open clearing
          </button>
          <button
            onClick={() =>
              travel([
                { x: 0, z: 26 },
                { x: 0, z: 14 },
                { x: 0, z: -3 },
                { x: -5, z: -10 },
              ])
            }
          >
            Return to Mara
          </button>
          <button
            onClick={() =>
              travel([
                ...(me && me.z > 26 ? [{ x: 0, z: 26 }] : []),
                ...(me && me.z > 14 ? [{ x: 0, z: 14 }] : []),
                { x: 0, z: -3 },
                { x: 7, z: -13 },
              ])
            }
          >
            Walk to Nemi
          </button>
          <button
            onClick={() =>
              connection.send({ type: "interact", target: "merchant" })
            }
          >
            Talk to Nemi
          </button>
          <button
            onClick={() => {
              fight.current = !fight.current;
              setStatus(
                fight.current
                  ? "Creature attack rehearsal enabled."
                  : "Creature attack rehearsal stopped.",
              );
            }}
          >
            Toggle creature rehearsal
          </button>
          <button
            onClick={() => {
              pvp.current = !pvp.current;
              setStatus(
                pvp.current
                  ? "Basic attacks on the selected target enabled. Ordinary PvP consequences apply."
                  : "Target attacks stopped.",
              );
            }}
          >
            Toggle selected-target attacks
          </button>
          <button
            onClick={() => {
              route.current = [];
              fight.current = false;
              pvp.current = false;
              connection.send({ type: "cancel" });
              setStatus("Stopped.");
            }}
          >
            Stop rehearsal
          </button>
        </div>
        <div className="lab-buttons">
          <button disabled={busy} onClick={() => void run(saveFrame)}>
            Save gameplay frame
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(() => recordPlay(scene()!, 75, setStatus, audioTracks()))
            }
          >
            Record 75 seconds
          </button>
          <button
            disabled={busy}
            onClick={() => void run(() => saveMetrics(scene()!))}
          >
            Save rendering metrics
          </button>
          <button
            disabled={busy}
            onClick={() => {
              elemental.current = !elemental.current;
              scene()?.previewElemental(elemental.current);
              setStatus(
                "Elemental surface study: fire, water, air, earth. Material preview only.",
              );
            }}
          >
            Elemental material study
          </button>
          <button
            disabled={busy}
            onClick={() => {
              hound.current = !hound.current;
              scene()?.previewHound(hound.current);
              setStatus(
                hound.current
                  ? "Hound asset study: idle, walk, run, attack, dodge, death; three seconds each. Local rig preview only."
                  : "Hound asset study closed.",
              );
            }}
          >
            Hound motion study
          </button>
          <button
            disabled={busy}
            onClick={() => {
              stress.current = !stress.current;
              scene()?.stress(stress.current);
              setStatus(
                "Synthetic renderer population; these are animation instances, not connected players.",
              );
            }}
          >
            Toggle rendering crowd
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(() => {
                benchAbort.current = new AbortController();
                return benchmark(
                  scene()!,
                  "stress",
                  setStatus,
                  benchAbort.current.signal,
                );
              })
            }
          >
            Run 10 minute stress
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(() => {
                benchAbort.current = new AbortController();
                return benchmark(
                  scene()!,
                  "memory",
                  setStatus,
                  benchAbort.current.signal,
                );
              })
            }
          >
            Run 30 minute memory trace
          </button>
          <button onClick={() => benchAbort.current?.abort()}>
            Cancel benchmark
          </button>
        </div>
        <output aria-live="polite">{status}</output>
      </details>
    </aside>
  );
}
