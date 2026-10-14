import type { CombatEvent, Snapshot } from "../../../packages/contracts/game";

const EVENT_LIFETIME = 2;

/** The wire sends new events once; retain their short presentation lifetime locally. */
export function retainEvents(
  recent: CombatEvent[],
  snapshot: Pick<Snapshot, "now" | "events">,
): CombatEvent[] {
  const last = recent.at(-1)?.id ?? 0;
  const kept = recent.filter((e) => snapshot.now - e.at < EVENT_LIFETIME);
  for (const e of snapshot.events) if (e.id > last) kept.push(e);
  return kept;
}
