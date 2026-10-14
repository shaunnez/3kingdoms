import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BUILD } from "../../packages/contracts/game";

/** Pages that may always reach a local development server. */
export const LOOPBACK_ORIGINS = [
  "http://127.0.0.1:4177",
  "http://localhost:4177",
  "http://127.0.0.1:4181",
];

export type PlaytestKey = { label: string; digest: Buffer };
export type ServerConfig = Readonly<{
  port: number;
  host: string;
  savePath: string;
  /** Invite-only playtest: keys, per-IP limits, no evidence or metrics routes. */
  public: boolean;
  origins: ReadonlySet<string>;
  keys: readonly PlaytestKey[];
  /** Read the client address from `X-Real-IP`, which only the host's edge may set. */
  trustProxy: boolean;
  clientDir: string;
  /** `clientDir/index.html` exists, so the server also serves the page. */
  clientAvailable: boolean;
  release: string;
  saveIntervalMs: number;
  reconnectSeconds: number;
  // For every limit below, 0 means unlimited.
  maxCharacters: number;
  newCharactersPerIp: number;
  maxSocketsPerIp: number;
  matchmakePerMinute: number;
  pendingSeatsPerIp: number;
  wsDeflate: boolean;
  loadFixture: boolean;
}>;

type Env = Record<string, string | undefined>;
const list = (value: string | undefined) =>
  (value ?? "").split(/[\s,]+/).filter(Boolean);
export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest();

function integer(
  env: Env,
  name: string,
  fallback: number,
  min = 0,
  max = 1_000_000,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw))
    throw new Error(`${name} must be a whole number, not "${raw}"`);
  const value = Number(raw);
  if (value < min || value > max)
    throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}

function origin(value: string): string {
  let parsed: URL | undefined;
  try {
    parsed = new URL(value);
  } catch {
    // Reported below.
  }
  if (!parsed || !/^https?:$/.test(parsed.protocol) || parsed.origin !== value)
    throw new Error(
      `THREEFOLD_ORIGINS entry "${value}" must be an exact origin such as https://play.example.org (scheme, host and optional port, no path or trailing slash; "*" is not allowed)`,
    );
  return value;
}

function playtestKeys(value: string | undefined, publicMode: boolean) {
  const keys: PlaytestKey[] = [];
  const labels = new Set<string>(),
    digests = new Set<string>();
  for (const pair of list(value)) {
    const split = pair.indexOf(":");
    const label = split > 0 ? pair.slice(0, split) : "",
      key = split > 0 ? pair.slice(split + 1) : "";
    // Never echo the key itself into an error that may reach a log.
    if (!/^[a-z0-9_-]{1,24}$/.test(label))
      throw new Error(
        `THREEFOLD_PLAYTEST_KEYS entries must look like name:key, with a lower-case name of up to 24 letters, digits, "_" or "-"`,
      );
    if (labels.has(label))
      throw new Error(`THREEFOLD_PLAYTEST_KEYS names "${label}" twice`);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new Error(
        `THREEFOLD_PLAYTEST_KEYS key for "${label}" must be 16–128 letters, digits, "_" or "-"`,
      );
    if (publicMode && /example|changeme/i.test(key))
      throw new Error(
        `THREEFOLD_PLAYTEST_KEYS key for "${label}" is a documentation example. Generate a real key.`,
      );
    const digest = sha256(key);
    if (digests.has(digest.toString("hex")))
      throw new Error(
        `THREEFOLD_PLAYTEST_KEYS gives "${label}" a key that another tester already has`,
      );
    labels.add(label);
    digests.add(digest.toString("hex"));
    keys.push({ label, digest });
  }
  return keys;
}

/** Validates the environment. Public mode fails closed with a message naming the variable. */
export function readConfig(env: Env = process.env): ServerConfig {
  const isPublic = env.THREEFOLD_PUBLIC === "1";
  const port = integer(
    env,
    env.THREEFOLD_PORT?.trim() ? "THREEFOLD_PORT" : "PORT",
    2567,
    0,
    65535,
  );
  const configured = list(env.THREEFOLD_ORIGINS).map(origin);
  const origins = new Set(
    isPublic ? configured : [...LOOPBACK_ORIGINS, ...configured],
  );
  const keys = playtestKeys(env.THREEFOLD_PLAYTEST_KEYS, isPublic);
  const clientDir = resolve(env.THREEFOLD_CLIENT_DIR?.trim() || "dist/hosted");
  const index = resolve(clientDir, "index.html");
  const clientAvailable = existsSync(index);
  if (isPublic) {
    if (!origins.size)
      throw new Error(
        "THREEFOLD_ORIGINS is required in public mode: list the playtest page's origin, such as https://your-app.up.railway.app",
      );
    if (!keys.length)
      throw new Error(
        "THREEFOLD_PLAYTEST_KEYS is required in public mode: give at least one name:key pair",
      );
    if (!clientAvailable)
      throw new Error(
        `THREEFOLD_CLIENT_DIR must contain the hosted client build in public mode; ${index} is missing (run npm run build:hosted)`,
      );
  }
  const release =
    env.THREEFOLD_RELEASE?.trim() ||
    (clientAvailable
      ? createHash("sha256")
          .update(readFileSync(index))
          .digest("hex")
          .slice(0, 12)
      : BUILD);
  const limit = (name: string, publicDefault: number) =>
    integer(env, name, isPublic ? publicDefault : 0);
  return Object.freeze({
    port,
    host: env.THREEFOLD_HOST?.trim() || "127.0.0.1",
    savePath: env.THREEFOLD_SAVE?.trim() || ".local/checkpoint-world.json",
    public: isPublic,
    origins,
    keys: Object.freeze(keys),
    trustProxy: env.THREEFOLD_TRUST_PROXY === "1",
    clientDir,
    clientAvailable,
    release,
    saveIntervalMs: Math.min(
      10_000,
      Math.max(1000, integer(env, "THREEFOLD_SAVE_INTERVAL_MS", 2000)),
    ),
    reconnectSeconds: integer(env, "THREEFOLD_RECONNECT_SECONDS", 20, 0, 600),
    maxCharacters: limit("THREEFOLD_MAX_CHARACTERS", 200),
    newCharactersPerIp: limit("THREEFOLD_NEW_CHARACTERS_PER_IP", 4),
    maxSocketsPerIp: limit("THREEFOLD_MAX_SOCKETS_PER_IP", 4),
    matchmakePerMinute: limit("THREEFOLD_MATCHMAKE_PER_MINUTE", 30),
    pendingSeatsPerIp: limit("THREEFOLD_PENDING_SEATS_PER_IP", 2),
    wsDeflate: env.THREEFOLD_WS_DEFLATE === "1",
    loadFixture: env.THREEFOLD_LOAD_FIXTURE === "1",
  });
}
