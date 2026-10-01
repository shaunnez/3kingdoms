import {
  distance,
  type ActorView,
  type AbilityKey,
} from "../../../packages/contracts/game";
import { lineOfSight } from "../../../packages/simulation/map";

/** Target UI describes an encounter the player can still see and act on. */
export function canDisplayTarget(
  actor: ActorView,
  observer: ActorView,
): boolean {
  return (
    actor.life !== "dead" &&
    !actor.returning &&
    distance(actor, observer) < 22 &&
    lineOfSight(actor, observer)
  );
}

// Authored Knight clips use these commit times; damage always comes from the server.
export const KNIGHT_MOTION: Partial<
  Record<AbilityKey, { clip: string; impact: number; recovery: number }>
> = {
  basic: { clip: "cut", impact: 0.3, recovery: 0.36 },
  "1": { clip: "sunder", impact: 0.45, recovery: 0.45 },
  "2": { clip: "bash", impact: 0.35, recovery: 0.3 },
  "3": { clip: "challenge", impact: 0.3, recovery: 0.32 },
  "4": { clip: "interpose", impact: 0.2, recovery: 0.3 },
  "5": { clip: "rally", impact: 0.7, recovery: 0.35 },
  r: { clip: "oath", impact: 0.6, recovery: 0.4 },
  q: { clip: "guard", impact: 0.1, recovery: 0.8 },
};

/** Map server windup to the authored contact pose, then play the recovery. */
export function actionPhase(
  elapsed: number,
  windup: number,
  impact: number,
  recovery: number,
): number {
  const duration = impact + recovery;
  return Math.max(
    0,
    Math.min(
      1,
      elapsed <= windup
        ? ((elapsed / Math.max(0.001, windup)) * impact) / duration
        : (impact + elapsed - windup) / duration,
    ),
  );
}
