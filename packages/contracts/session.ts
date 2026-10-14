import type { Guild } from "./game";

/** Close code sent to a connection when the same traveller joins elsewhere. */
export const SESSION_SUPERSEDED = 4100;

/** Options the client sends with `joinOrCreate("briar-gate", …)`. */
export type JoinOptions = {
  protocol: number;
  /** 64 hex characters, generated and kept by the browser. */
  token: string;
  name?: string;
  guild?: Guild;
  /** Personal playtest key; required only by the hosted playtest server. */
  invite?: string;
};

/** First message after a join or reconnect. */
export type Welcome = {
  id: string;
  build: string;
  /** Changes on every deploy, so a client can offer a reload. */
  release: string;
};
