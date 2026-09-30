import type { CombatEvent } from "../../../packages/contracts/game";

/** Original synthesized checkpoint audio. No external samples or runtime generation service. */
export class Soundscape {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private recording: MediaStreamAudioDestinationNode | null = null;
  enabled = false;
  private last = 0;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.3;
      this.master.connect(this.context.destination);
      this.recording = this.context.createMediaStreamDestination();
      this.master.connect(this.recording);
      this.ambience = this.context.createGain();
      this.ambience.gain.value = 0.12;
      this.ambience.connect(this.master);
      const length = this.context.sampleRate * 8,
        buffer = this.context.createBuffer(1, length, this.context.sampleRate),
        data = buffer.getChannelData(0);
      let b = 0;
      for (let i = 0; i < length; i++) {
        b = (b + (Math.random() * 2 - 1) * 0.02) / 1.02;
        data[i] = b * 3.5;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 650;
      source.connect(filter).connect(this.ambience);
      source.start();
      for (const hz of [73.416, 110, 146.832]) {
        const osc = this.context.createOscillator(),
          g = this.context.createGain();
        osc.frequency.value = hz;
        osc.type = "sine";
        g.gain.value = 0.014;
        osc.connect(g).connect(this.ambience);
        osc.start();
      }
    }
    await this.context.resume();
    this.enabled = true;
    this.master!.gain.value = 0.3;
  }
  toggle() {
    if (this.enabled) {
      this.enabled = false;
      if (this.master) this.master.gain.value = 0;
    } else void this.unlock();
  }
  zone(open: boolean) {
    if (this.context && this.ambience)
      this.ambience.gain.setTargetAtTime(
        open ? 0.2 : 0.12,
        this.context.currentTime,
        1,
      );
  }
  tone(
    hz: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.15,
    slide = 0,
  ) {
    if (!this.context || !this.master || !this.enabled) return;
    const t = this.context.currentTime,
      o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, t);
    if (slide)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(20, hz + slide),
        t + duration,
      );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  noise(duration: number, frequency: number, volume = 0.2) {
    if (!this.context || !this.master || !this.enabled) return;
    const c = this.context,
      t = c.currentTime;
    const buffer = c.createBuffer(
        1,
        Math.ceil(c.sampleRate * duration),
        c.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    const gain = c.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }
  events(events: CombatEvent[]) {
    for (const e of events) {
      if (e.id <= this.last) continue;
      this.last = e.id;
      if (e.type === "cast") {
        this.noise(0.16, 1500, 0.15);
        if (e.key === "1") this.tone(220, 0.35, "sine", 0.08, 500);
      } else if (e.type === "hit") {
        this.noise(0.18, 600, 0.35);
        this.tone(100, 0.12, "triangle", 0.2, -40);
      } else if (e.type === "dodge") this.noise(0.3, 1700, 0.25);
      else if (e.type === "death") {
        this.tone(130, 0.8, "sine", 0.18, -70);
        this.noise(0.45, 300, 0.15);
      } else if (e.type === "loot" || e.type === "level") {
        this.tone(440, 0.35, "sine", 0.09);
        setTimeout(() => this.tone(660, 0.5, "sine", 0.08), 120);
      } else if (e.type === "heal") this.tone(520, 0.4, "sine", 0.04, 140);
    }
  }
  step() {
    this.noise(0.055, 280, 0.14);
  }
  dispose() {
    const context = this.context;
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.enabled = false;
    this.recording = null;
    if (context && context.state !== "closed")
      void context
        .close()
        .catch((error) => console.warn("Audio teardown failed", error));
  }
  captureAudio() {
    return (
      this.recording?.stream.getAudioTracks().map((track) => track.clone()) ??
      []
    );
  }
}
