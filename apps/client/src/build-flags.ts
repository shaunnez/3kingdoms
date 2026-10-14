// Set by apps/client/vite.config.ts. Undefined under tsx and node:test.
declare const __THREEFOLD_HOSTED__: boolean | undefined;

/**
 * The hosted playtest build (`npm run build:hosted`): served by the game
 * server itself, multiplayer only, with solo mode replaced by a stub.
 */
export const HOSTED =
  typeof __THREEFOLD_HOSTED__ !== "undefined" && __THREEFOLD_HOSTED__ === true;

export type BuildEnv = {
  /** `VITE_SERVER_URL`: the game server for a separately hosted page. */
  serverUrl?: string;
  /** `VITE_SERVER_ALLOWLIST`: origins a `?server=` link may choose. */
  allowlist: string[];
};

/** Build-time settings; empty outside Vite. */
export function buildEnv(): BuildEnv {
  const env = import.meta.env as Record<string, unknown> | undefined;
  const text = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  return {
    serverUrl: text(env?.VITE_SERVER_URL) || undefined,
    allowlist: text(env?.VITE_SERVER_ALLOWLIST)
      .split(/[\s,]+/)
      .filter(Boolean),
  };
}
