import {
  distance,
  type ActorView,
  type CombatEvent,
} from "../../../packages/contracts/game";

/** Original synthesized checkpoint audio. No external samples or runtime generation service. */
export class Soundscape {
  context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private recording: MediaStreamAudioDestinationNode | null = null;
  enabled = false;
  private last = 0;
  private voices = new Set<AudioScheduledSourceNode>();
  private pan = 0;
  private attenuation = 1;
  private noiseBuffer: AudioBuffer | null = null;
  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.3;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 8;
      this.master.connect(limiter).connect(this.context.destination);
      this.recording = this.context.createMediaStreamDestination();
      limiter.connect(this.recording);
      this.noiseBuffer = this.context.createBuffer(
        1,
        this.context.sampleRate,
        this.context.sampleRate,
      );
      const noise = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
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
    if (
      !this.context ||
      !this.master ||
      !this.enabled ||
      this.voices.size >= 24
    )
      return;
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
    g.gain.linearRampToValueAtTime(volume * this.attenuation, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const pan = this.context.createStereoPanner();
    pan.pan.value = this.pan;
    o.connect(g).connect(pan).connect(this.master);
    this.voices.add(o);
    o.start(t);
    o.stop(t + duration + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      pan.disconnect();
      this.voices.delete(o);
    };
  }
  noise(
    duration: number,
    frequency: number,
    volume = 0.2,
    endFrequency = frequency,
  ) {
    if (
      !this.context ||
      !this.master ||
      !this.enabled ||
      !this.noiseBuffer ||
      this.voices.size >= 24
    )
      return;
    const c = this.context,
      t = c.currentTime;
    const source = c.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(frequency, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFrequency),
      t + duration,
    );
    filter.Q.value = 0.65;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume * this.attenuation, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const pan = c.createStereoPanner();
    pan.pan.value = this.pan;
    source.connect(filter).connect(gain).connect(pan).connect(this.master);
    this.voices.add(source);
    source.start();
    source.stop(t + duration + 0.01);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      pan.disconnect();
      this.voices.delete(source);
    };
  }
  events(events: CombatEvent[], actors: ActorView[], self: string) {
    const me = actors.find((a) => a.id === self);
    for (const e of events) {
      if (e.id <= this.last) continue;
      this.last = e.id;
      const source = actors.find((a) => a.id === e.source),
        target = actors.find((a) => a.id === e.target);
      if (!source || !me) continue;
      const origin = e.type === "hit" && target ? target : source;
      const range = distance(me, origin);
      if (range > 27) continue;
      this.attenuation = 1 / (1 + range * 0.1);
      this.pan = Math.max(-0.75, Math.min(0.75, (origin.x - me.x) / 12));
      const knight = source.guild === "knight" && source.kind !== "wolf";
      if (e.type === "cast") {
        if (source.kind === "wolf") {
          this.noise(0.35, 160, 0.15, 340);
          this.tone(72, 0.25, "triangle", 0.06, -20);
        } else if (knight) {
          this.noise(0.12, 1800, 0.1, 800);
          if (e.key === "1") this.noise(0.3, 500, 0.12, 1500);
          if (e.key === "q" || e.key === "2")
            this.tone(640, 0.13, "triangle", 0.035, -240);
        } else {
          this.tone(
            e.key === "1" ? 190 : 360,
            e.key === "1" ? 0.5 : 0.15,
            "sine",
            0.05,
            500,
          );
        }
      } else if (e.type === "resolve") {
        if (source.kind === "wolf") this.noise(0.13, 900, 0.1, 250);
        else if (knight) {
          if (e.key === "basic" || e.key === "1")
            this.noise(
              e.key === "1" ? 0.24 : 0.16,
              2400,
              e.key === "1" ? 0.3 : 0.2,
              350,
            );
          else if (e.key === "2") this.noise(0.13, 380, 0.23, 110);
          else if (e.key === "3") {
            this.tone(196, 0.3, "triangle", 0.07);
            this.tone(294, 0.28, "sine", 0.05);
          } else if (e.key === "5" || e.key === "r") {
            this.tone(196, 0.7, "sine", 0.07);
            this.tone(392, 0.55, "sine", 0.045);
            this.tone(e.key === "r" ? 588 : 494, 0.8, "sine", 0.035);
          }
        } else if (e.key === "basic" || e.key === "1") {
          this.tone(e.key === "1" ? 800 : 1100, 0.18, "triangle", 0.1, -650);
          this.noise(0.12, 2400, 0.15, 500);
        } else if (e.key === "4") this.noise(0.55, 3200, 0.2, 900);
      } else if (e.type === "hit") {
        const heavy = e.key === "1" || e.key === "2";
        this.noise(
          heavy ? 0.21 : 0.14,
          e.blocked ? 2200 : 600,
          heavy ? 0.3 : 0.23,
          200,
        );
        this.tone(heavy ? 88 : 115, 0.13, "triangle", 0.14, -45);
        if (e.blocked || e.key === "2") {
          this.tone(713, 0.19, "sine", 0.08, -55);
          this.tone(1147, 0.11, "sine", 0.04, -130);
        }
      } else if (e.type === "dodge") this.noise(0.3, 1700, 0.25);
      else if (e.type === "death") {
        this.tone(130, 0.8, "sine", 0.18, -70);
        this.noise(0.45, 300, 0.15);
      } else if (e.type === "loot" || e.type === "level") {
        this.tone(440, 0.35, "sine", 0.09);
        setTimeout(() => this.tone(660, 0.5, "sine", 0.08), 120);
      } else if (e.type === "heal") this.tone(520, 0.4, "sine", 0.04, 140);
    }
    this.pan = 0;
    this.attenuation = 1;
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
    this.noiseBuffer = null;
    this.voices.clear();
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
