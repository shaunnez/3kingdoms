import { createHash, randomBytes } from "node:crypto";

/** One JSON line per event. Callers never pass tokens, keys, options or raw IPs. */
export type Log = (event: string, fields?: Record<string, unknown>) => void;

export function createLog(
  write: (line: string) => void = (line) => process.stdout.write(line + "\n"),
): Log {
  return (event, fields = {}) =>
    write(JSON.stringify({ event, at: new Date().toISOString(), ...fields }));
}

// A fresh salt per process: tags group one session's lines without being
// reversible to an address or comparable across restarts.
const salt = randomBytes(16);
export function ipTag(ip: string): string {
  return createHash("sha256")
    .update(salt)
    .update(ip)
    .digest("hex")
    .slice(0, 10);
}
