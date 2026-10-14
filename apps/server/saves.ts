import * as nodeFs from "node:fs";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import type { Log } from "./log";

type SaveFs = {
  writeFile: (
    path: string,
    data: string,
    options: { mode: number },
  ) => Promise<void>;
  writeFileSync: (
    path: string,
    data: string,
    options: { mode: number },
  ) => void;
  renameSync: (from: string, to: string) => void;
  unlinkSync: (path: string) => void;
};

/**
 * Batched background saves with an immediate path. `requestSave()` marks the
 * world dirty and a timer writes it at most once per interval without blocking
 * the tick. `flushNow()` writes synchronously, for loot escrow and shutdown. A
 * generation number keeps an older background write from replacing a newer
 * immediate one when it finishes late.
 */
export class SaveQueue {
  private dirty = false;
  private inFlight = false;
  private generation = 0;
  private writtenGen = 0;
  private lastWritten = "";
  private timer: ReturnType<typeof setInterval>;
  private counts = {
    writes: 0,
    skipped: 0,
    failures: 0,
    lastMs: 0,
    maxMs: 0,
    bytes: 0,
  };
  private path: string;
  private serialize: () => string;
  private log: Log;
  private fs: SaveFs;
  constructor(options: {
    path: string;
    serialize: () => string;
    intervalMs: number;
    log: Log;
    fs?: SaveFs;
  }) {
    this.path = options.path;
    this.serialize = options.serialize;
    this.log = options.log;
    this.fs = options.fs ?? { ...nodeFs, writeFile };
    this.timer = setInterval(() => {
      if (this.dirty && !this.inFlight) void this.writeAsync();
    }, options.intervalMs);
    this.timer.unref();
  }
  requestSave() {
    this.dirty = true;
  }
  /** Resolves once the write (or skip) has finished; failures are logged and retried. */
  async writeAsync(): Promise<void> {
    if (this.inFlight) return;
    const gen = ++this.generation,
      start = performance.now();
    const json = this.serialize();
    this.dirty = false;
    if (json === this.lastWritten) {
      this.counts.skipped++;
      return;
    }
    const temporary = `${this.path}.async.tmp`;
    this.inFlight = true;
    try {
      await this.fs.writeFile(temporary, json, { mode: 0o600 });
      if (gen > this.writtenGen) {
        this.fs.renameSync(temporary, this.path);
        this.written(gen, json, start);
      } else this.fs.unlinkSync(temporary);
    } catch (error) {
      this.failed(error);
    } finally {
      this.inFlight = false;
    }
  }
  /** Writes now, synchronously. Returns false (and stays dirty) if the write failed. */
  flushNow(reason: string): boolean {
    const gen = ++this.generation,
      start = performance.now();
    try {
      const json = this.serialize();
      const temporary = `${this.path}.sync.tmp`;
      this.fs.writeFileSync(temporary, json, { mode: 0o600 });
      this.fs.renameSync(temporary, this.path);
      this.written(gen, json, start);
      this.dirty = false;
      return true;
    } catch (error) {
      this.failed(error, reason);
      return false;
    }
  }
  stats() {
    return { ...this.counts };
  }
  stop() {
    clearInterval(this.timer);
  }
  private written(gen: number, json: string, start: number) {
    this.writtenGen = gen;
    this.lastWritten = json;
    const ms = performance.now() - start;
    this.counts.writes++;
    this.counts.lastMs = ms;
    this.counts.maxMs = Math.max(this.counts.maxMs, ms);
    this.counts.bytes = Buffer.byteLength(json);
  }
  private failed(error: unknown, reason?: string) {
    this.dirty = true;
    this.counts.failures++;
    this.log("save-failed", {
      code: (error as NodeJS.ErrnoException).code ?? "unknown",
      ...(reason ? { reason } : {}),
    });
  }
}
