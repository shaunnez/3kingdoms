import { Client, type Room } from "@colyseus/sdk";
import {
  PROTOCOL,
  type Command,
  type Guild,
  type Notice,
  type Snapshot,
  type CombatEvent,
} from "../../../packages/contracts/game";
type Intent = Command extends infer C
  ? C extends Command
    ? Omit<C, "seq">
    : never
  : never;
export class Connection {
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
      // The wire sends new events once; retain their short presentation lifetime locally.
      const last = this.recentEvents.at(-1)?.id ?? 0;
      this.recentEvents = this.recentEvents.filter((e) => s.now - e.at < 2);
      this.recentEvents.push(...s.events.filter((e) => e.id > last));
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
