import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL,
  type Command,
  type Guild,
  type Notice,
  type Snapshot,
  type CombatEvent,
} from "../../../packages/contracts/game";
import { LocalConnection, retainEvents } from "./local-world";

export type ConnectionMode = "solo" | "server";
export type Intent = Command extends infer C
  ? C extends Command
    ? Omit<C, "seq">
    : never
  : never;
/** What the client needs from a world host, in the page or over Colyseus. */
export interface GameConnection {
  readonly mode: ConnectionMode;
  onSnapshot: (snapshot: Snapshot) => void;
  onNotice: (notice: Notice) => void;
  onStatus: (status: string) => void;
  join(name: string, guild: Guild): Promise<void>;
  send(command: Intent): void;
  leave(): void;
}

/** `?server` or `?mode=server` selects the local Colyseus server; everything else plays solo. */
export function preferredMode(search?: string): ConnectionMode {
  const query =
    search ?? (typeof location !== "undefined" ? location.search : "");
  const params = new URLSearchParams(query);
  return params.has("server") || params.get("mode") === "server"
    ? "server"
    : "solo";
}

export function createConnection(mode: ConnectionMode): GameConnection {
  return mode === "server" ? new Connection() : new LocalConnection();
}

export class Connection implements GameConnection {
  readonly mode = "server";
  room: Room | null = null;
  private seq = 0;
  private recentEvents: CombatEvent[] = [];
  private client = new Client("http://127.0.0.1:2567");
  onSnapshot: (snapshot: Snapshot) => void = () => {};
  onNotice: (notice: Notice) => void = () => {};
  onStatus: (status: string) => void = () => {};
  async join(name: string, guild: Guild) {
    this.onStatus("Connecting to Highcross…");
    let token = sessionStorage.getItem("threefold-token");
    if (!token) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem("threefold-token", token);
    }
    const room = await this.client.joinOrCreate("briar-gate", {
      name,
      guild,
      token,
      protocol: PROTOCOL,
    });
    this.room = room;
    this.seq = 0;
    this.recentEvents = [];
    room.onMessage("welcome", () => {});
    room.onMessage("snapshot", (s: Snapshot) => {
      if (s.protocol !== PROTOCOL) {
        this.onStatus("Version mismatch. Reload the client.");
        return;
      }
      this.recentEvents = retainEvents(this.recentEvents, s);
      this.onSnapshot({ ...s, events: this.recentEvents });
    });
    room.onMessage("notice", (n: Notice) => this.onNotice(n));
    room.onError((_code, message) =>
      this.onStatus(message ?? "Connection error"),
    );
    room.onLeave(() => {
      if (this.room !== room) return;
      this.room = null;
      this.onStatus(
        "Disconnected. Your body remains in the world for at least 60 seconds. Reconnect to return.",
      );
    });
    this.onStatus("Connected");
  }
  send(command: Intent) {
    this.room?.send("command", { ...command, seq: ++this.seq });
  }
  leave() {
    void this.room?.leave();
    this.room = null;
  }
}
