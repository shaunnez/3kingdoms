import type { Guild, Notice, Snapshot } from "../../../packages/contracts/game";
import type { GameConnection, Intent } from "./network";

// The hosted playtest build swaps local-world.ts for this file
// (apps/client/vite.config.ts), so the page the game server serves carries no
// simulation, quest text or answers. It must import nothing from
// packages/simulation. Type checks and tests always see the real module.

export type SoloStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SoloLocks = Pick<LockManager, "request">;
export type LocalConnectionOptions = {
  storage?: SoloStorage;
  now?: () => number;
  locks?: SoloLocks | null;
};

/**
 * Never shown here: no solo world runs in this build. A distinct value keeps
 * the real message out of the hosted bundle's marker scan.
 */
export const SOLO_STOPPED = "hosted-build:no-solo-world";

/** Never thrown here; kept so client code can still test for it. */
export class SoloBusyError extends Error {}

export class LocalConnection implements GameConnection {
  readonly mode = "solo";
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onNotice: (notice: Notice) => void = () => {};
  onStatus: (status: string) => void = () => {};
  constructor(_options: LocalConnectionOptions = {}) {
    throw new Error("Solo play isn't part of the hosted playtest build.");
  }
  async join(_name: string, _guild: Guild): Promise<void> {}
  async startFresh(): Promise<void> {}
  send(_command: Intent): void {}
  leave(): void {}
}
