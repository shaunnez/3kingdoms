import {
  distance,
  type ActorView,
  type CombatEvent,
  type Vec2,
} from "../../../packages/contracts/game";

type Bus = "dry" | "wet" | "music" | "pad";
/** A short-lived group of sources sharing one distance gain and stereo panner. */
type Voice = {
  c: AudioContext;
  t: number;
  out: GainNode;
  nodes: AudioNode[];
  live: number;
  pool: Set<AudioScheduledSourceNode>;
};
/** One oscillator partial. Times are seconds from the voice start; `d` is the exponential decay after attack and hold. */
type Tone = {
  w?: OscillatorType;
  f: number;
  to?: number;
  g?: number;
  at?: number;
  a?: number;
  h?: number;
  d: number;
  v: number;
  det?: number;
  lp?: number;
  lpTo?: number;
  q?: number;
  fm?: [rate: number, depth: number];
  vib?: [rate: number, cents: number];
  wah?: [rate: number, depth: number];
};
/** One filtered noise burst; the filter sweeps from `f` to `to`. */
type Hiss = {
  type?: BiquadFilterType;
  f: number;
  to?: number;
  q?: number;
  at?: number;
  a?: number;
  h?: number;
  d: number;
  v: number;
};
type Chord = { bass: number; pad: number[]; tones: number[] };
type Mood = {
  bpm: number;
  swing: number;
  scale: number[];
  progressions: string[][];
  timbre: "box" | "marimba";
  bass: number[];
};

const MASTER = 0.3;
const SFX_SOURCES = 40;
const MUSIC_SOURCES = 40;
const LOOKAHEAD = 1.1;

const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
const chord = (bass: number, ...pad: number[]): Chord => ({
  bass,
  pad,
  tones: [bass, ...pad].map((n) => n % 12),
});
const CHORDS: Record<string, Chord> = {
  F: chord(53, 53, 57, 60),
  Dm: chord(50, 50, 53, 57),
  Bb: chord(46, 50, 53, 58),
  C: chord(48, 52, 55, 60),
  Am: chord(45, 52, 57, 60),
  G: chord(43, 50, 55, 59),
};
// Calm: F major pentatonic music box. Open PvP: the same notes leaning on D dorian, played on marimba.
const CALM: Mood = {
  bpm: 84,
  swing: 0.12,
  scale: [65, 67, 69, 72, 74, 77, 79, 81, 84, 86],
  progressions: [
    ["F", "Dm", "Bb", "C"],
    ["F", "C", "Dm", "Bb"],
    ["Bb", "C", "F", "Dm"],
    ["F", "Am", "Bb", "C"],
    ["Dm", "Bb", "F", "C"],
  ],
  timbre: "box",
  bass: [0, 4],
};
const TENSE: Mood = {
  bpm: 92,
  swing: 0.05,
  scale: [62, 65, 67, 69, 71, 72, 74, 77, 79, 81],
  progressions: [
    ["Dm", "G", "Dm", "C"],
    ["Dm", "C", "G", "Dm"],
    ["Dm", "Am", "G", "C"],
    ["Dm", "F", "G", "Dm"],
  ],
  timbre: "marimba",
  bass: [0, 3, 6],
};
const RHYTHMS = [
  [1, 0, 1, 0, 1, 1, 0, 0],
  [1, 0, 0, 1, 0, 0, 1, 0],
  [1, 1, 0, 1, 0, 1, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, 1, 1],
  [1, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 0, 0, 0, 0],
];
const STEPS = [-2, -1, -1, 0, 1, 1, 2, 3];

/** Small deterministic generator (mulberry32) so the melody varies without obvious loops. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shape(
  param: AudioParam,
  t: number,
  a: number,
  h: number,
  d: number,
  v: number,
) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(v, t + a);
  if (h) param.setValueAtTime(v, t + a + h);
  param.exponentialRampToValueAtTime(0.0001, t + a + h + d);
}

const vary = (spread = 0.06) => 1 - spread + Math.random() * spread * 2;

/**
 * Original synthesized soundscape for the cute voxel look: a seeded music-box
 * melody over soft pads, critter chirps, and bouncy cartoon combat cues.
 * Pure procedural synthesis (no samples, no network); nothing is created
 * before unlock().
 */
export class Soundscape {
  context: AudioContext | null = null;
  enabled = false;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private recording: MediaStreamAudioDestinationNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private buses: Partial<Record<Bus, AudioNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private notes = new Set<AudioScheduledSourceNode>();
  private recent = new Map<string, number>();
  private last = 0;
  private pan = 0;
  private attenuation = 1;
  private right: Vec2 = { x: -1, z: 0 };
  private listener: Vec2 | null = null;
  private stride = 1;
  private open: boolean | null = null;
  // Separate seeded streams keep the melody independent of critter timing.
  private rand = seeded(0x45);
  private wild = seeded(0x5eed);
  private beat = 0;
  private tick = 0;
  private critter = 0;
  private phrase: (number | null)[] = [];
  private progression = CALM.progressions[0];
  private progressionMood: Mood | null = null;
  private chord = CHORDS.F;

  async unlock() {
    if (!this.context) this.build();
    const context = this.context!;
    await context.resume();
    if (this.context !== context) return;
    this.enabled = true;
    this.setMaster(MASTER);
    this.schedule();
  }
  toggle() {
    if (this.enabled) {
      this.enabled = false;
      this.setMaster(0);
      return;
    }
    // Re-enabling a running context is synchronous so callers can read `enabled` straight away.
    if (this.context?.state === "running") {
      this.enabled = true;
      this.setMaster(MASTER);
    }
    void this.unlock().catch((error) =>
      console.warn("Audio unlock failed", error),
    );
  }
  /** Open PvP areas shift the music to a tenser dorian colour with a soft heartbeat. */
  zone(open: boolean) {
    if (open === this.open) return;
    const first = this.open === null;
    this.open = open;
    if (!this.context || !this.ambience || !this.padFilter) return;
    const t = this.context.currentTime;
    this.ambience.gain.setTargetAtTime(open ? 0.66 : 0.6, t, 1);
    this.padFilter.frequency.setTargetAtTime(open ? 650 : 1100, t, 1.5);
    if (!first && this.fresh("zone", 2.5)) this.sting(open);
  }
  /** Optional: keep stereo panning aligned with the camera (ArcRotateCamera alpha). */
  orient(alpha: number) {
    this.right = { x: Math.sin(alpha), z: -Math.cos(alpha) };
  }
  events(events: CombatEvent[], actors: ActorView[], self: string) {
    const me = actors.find((a) => a.id === self);
    if (me) this.listener = { x: me.x, z: me.z };
    for (const e of events) {
      if (e.id <= this.last) continue;
      this.last = e.id;
      const source = actors.find((a) => a.id === e.source);
      if (!source || !me) continue;
      const located =
        e.type === "hit" || e.type === "death" || e.type === "heal";
      const origin: Vec2 = located ? { x: e.x, z: e.z } : source;
      const range = distance(me, origin);
      if (range > 27) continue;
      this.attenuation = 1 / (1 + range * 0.1);
      const side =
        (origin.x - me.x) * this.right.x + (origin.z - me.z) * this.right.z;
      this.pan = Math.max(-0.75, Math.min(0.75, side / 12));
      this.cue(e, source, actors, self);
    }
    this.pan = 0;
    this.attenuation = 1;
  }
  /** Soft footstep tap; the surface follows the last known player position. */
  step() {
    this.stride = -this.stride;
    const v = this.voice("dry", { pan: this.stride * 0.08 });
    if (!v) return;
    const r = vary(0.08),
      p = this.listener;
    if (p && p.z < 0) {
      this.hiss(v, { f: 2300 * r, q: 1.6, a: 0.002, d: 0.045, v: 0.3 });
      this.tone(v, {
        w: "triangle",
        f: 270 * r,
        to: 200 * r,
        a: 0.002,
        d: 0.05,
        v: 0.07,
      });
    } else if (p && p.z > 15.5 && p.z < 24.5) {
      this.tone(v, { f: 310 * r, to: 230 * r, a: 0.002, d: 0.09, v: 0.14 });
      this.hiss(v, { f: 820 * r, q: 3, a: 0.002, d: 0.05, v: 0.24 });
    } else {
      this.hiss(v, {
        f: 560 * r,
        to: 380 * r,
        q: 1.1,
        a: 0.006,
        d: 0.07,
        v: 0.42,
      });
      this.tone(v, { f: 160 * r, to: 115 * r, a: 0.004, d: 0.06, v: 0.06 });
    }
  }
  /** Optional cute interface blips for the HUD. */
  ui(kind: "click" | "open" | "close" | "error") {
    const v = this.voice("wet", { pan: 0, gain: 1 });
    if (!v) return;
    if (kind === "click")
      this.tone(v, { f: 880, to: 1320, g: 0.03, a: 0.002, d: 0.07, v: 0.07 });
    else if (kind === "error") {
      this.tone(v, { w: "triangle", f: 220, a: 0.004, d: 0.12, v: 0.09 });
      this.tone(v, {
        w: "triangle",
        f: 196,
        at: 0.11,
        a: 0.004,
        d: 0.16,
        v: 0.09,
      });
    } else {
      const [a, b] = kind === "open" ? [784, 1175] : [1175, 784];
      this.tone(v, { f: a, a: 0.003, d: 0.14, v: 0.06 });
      this.tone(v, { f: b, at: 0.07, a: 0.003, d: 0.22, v: 0.06 });
    }
  }
  dispose() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const context = this.context;
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.padFilter = null;
    this.buses = {};
    this.enabled = false;
    this.recording = null;
    this.noiseBuffer = null;
    this.voices.clear();
    this.notes.clear();
    this.recent.clear();
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

  // ───────────────────────────── graph ─────────────────────────────

  private build() {
    const c = new AudioContext();
    this.context = c;
    this.beat = this.critter = 0;
    const master = c.createGain();
    master.gain.value = 0;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    master.connect(limiter).connect(c.destination);
    this.recording = c.createMediaStreamDestination();
    limiter.connect(this.recording);
    this.master = master;

    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
      samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noise;

    // One shared, short "toy room" reverb for chimes, music and sparkles.
    const reverb = c.createConvolver();
    reverb.buffer = this.impulse(c, 1.3);
    const reverbOut = c.createGain();
    reverbOut.gain.value = 0.8;
    reverb.connect(reverbOut).connect(master);
    const send = (from: AudioNode, level: number) => {
      const g = c.createGain();
      g.gain.value = level;
      from.connect(g).connect(reverb);
    };

    const dry = c.createGain();
    dry.connect(master);
    const wet = c.createGain();
    wet.connect(master);
    send(wet, 0.35);
    const ambience = c.createGain();
    ambience.gain.value = this.open ? 0.66 : 0.6;
    ambience.connect(master);
    send(ambience, 0.5);
    const padFilter = c.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = this.open ? 650 : 1100;
    padFilter.Q.value = 0.5;
    padFilter.connect(ambience);
    this.ambience = ambience;
    this.padFilter = padFilter;
    this.buses = { dry, wet, music: ambience, pad: padFilter };

    // A barely-there breeze so silence never feels dead.
    const breeze = c.createBufferSource();
    breeze.buffer = noise;
    breeze.loop = true;
    const air = c.createBiquadFilter();
    air.type = "bandpass";
    air.frequency.value = 320;
    air.Q.value = 0.6;
    const airLevel = c.createGain();
    airLevel.gain.value = 0.06;
    const sway = c.createOscillator(),
      swayDepth = c.createGain();
    sway.frequency.value = 0.07;
    swayDepth.gain.value = 120;
    sway.connect(swayDepth).connect(air.frequency);
    breeze.connect(air).connect(airLevel).connect(ambience);
    breeze.start();
    sway.start();

    this.timer = setInterval(this.schedule, 200);
  }
  private impulse(c: AudioContext, seconds: number) {
    const rate = c.sampleRate,
      length = Math.floor(rate * seconds),
      ir = c.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      let smooth = 0;
      for (let i = Math.floor(rate * 0.012); i < length; i++) {
        const k = i / length;
        smooth += (Math.random() * 2 - 1 - smooth) * (0.6 - 0.45 * k);
        data[i] = smooth * Math.exp(-k * 6.5);
      }
    }
    return ir;
  }
  private setMaster(value: number) {
    if (!this.context || !this.master) return;
    const gain = this.master.gain,
      t = this.context.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(value, t + 0.04);
  }
  private fresh(key: string, gap: number) {
    const now = this.context?.currentTime ?? 0,
      last = this.recent.get(key);
    if (last !== undefined && now - last < gap && now >= last) return false;
    this.recent.set(key, now);
    return true;
  }
  private voice(
    bus: Bus,
    options: {
      at?: number;
      pan?: number;
      gain?: number;
      urgent?: boolean;
    } = {},
  ): Voice | null {
    const c = this.context,
      destination = this.buses[bus];
    if (!c || !destination || !this.enabled) return null;
    const music = bus === "music" || bus === "pad",
      pool = music ? this.notes : this.voices,
      cap = music ? MUSIC_SOURCES : SFX_SOURCES + (options.urgent ? 12 : 0);
    if (pool.size >= cap) return null;
    const out = c.createGain();
    out.gain.value = options.gain ?? (music ? 1 : this.attenuation);
    const panner = c.createStereoPanner();
    panner.pan.value = options.pan ?? (music ? 0 : this.pan);
    out.connect(panner).connect(destination);
    return {
      c,
      t: options.at ?? c.currentTime + 0.005,
      out,
      nodes: [out, panner],
      live: 0,
      pool,
    };
  }
  private run(
    v: Voice,
    source: AudioScheduledSourceNode,
    start: number,
    end: number,
  ) {
    if (source instanceof AudioBufferSourceNode)
      source.start(start, Math.random() * 1.5);
    else source.start(start);
    source.stop(end);
    v.live++;
    v.pool.add(source);
    v.nodes.push(source);
    source.onended = () => {
      v.pool.delete(source);
      if (--v.live === 0) for (const node of v.nodes) node.disconnect();
    };
  }
  private lfo(
    v: Voice,
    rate: number,
    depth: number,
    start: number,
    end: number,
  ) {
    const o = v.c.createOscillator(),
      g = v.c.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g);
    v.nodes.push(g);
    this.run(v, o, start, end);
    return g;
  }
  private tone(v: Voice, p: Tone) {
    const c = v.c,
      t = v.t + (p.at ?? 0),
      a = p.a ?? 0.004,
      h = p.h ?? 0,
      end = t + a + h + p.d;
    const o = c.createOscillator();
    o.type = p.w ?? "sine";
    o.frequency.setValueAtTime(p.f, t);
    if (p.to)
      o.frequency.exponentialRampToValueAtTime(p.to, t + (p.g ?? end - t));
    if (p.det) o.detune.value = p.det;
    const env = c.createGain();
    env.gain.value = 0;
    shape(env.gain, t, a, h, p.d, p.v);
    let head: AudioNode = o;
    if (p.lp) {
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.Q.value = p.q ?? 0.7;
      filter.frequency.setValueAtTime(p.lp, t);
      if (p.lpTo) filter.frequency.exponentialRampToValueAtTime(p.lpTo, end);
      if (p.wah)
        this.lfo(v, p.wah[0], p.wah[1], t, end + 0.02).connect(
          filter.frequency,
        );
      head = head.connect(filter);
      v.nodes.push(filter);
    }
    head.connect(env).connect(v.out);
    v.nodes.push(env);
    if (p.fm) this.lfo(v, p.fm[0], p.fm[1], t, end + 0.02).connect(o.frequency);
    if (p.vib) this.lfo(v, p.vib[0], p.vib[1], t, end + 0.02).connect(o.detune);
    this.run(v, o, t, end + 0.02);
    return o;
  }
  private hiss(v: Voice, p: Hiss) {
    if (!this.noiseBuffer) return;
    const c = v.c,
      t = v.t + (p.at ?? 0),
      a = p.a ?? 0.004,
      h = p.h ?? 0,
      end = t + a + h + p.d;
    const source = c.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = p.type ?? "bandpass";
    filter.Q.value = p.q ?? 1;
    filter.frequency.setValueAtTime(p.f, t);
    if (p.to) filter.frequency.exponentialRampToValueAtTime(p.to, end);
    const env = c.createGain();
    env.gain.value = 0;
    shape(env.gain, t, a, h, p.d, p.v);
    source.connect(filter).connect(env).connect(v.out);
    v.nodes.push(filter, env);
    this.run(v, source, t, end + 0.02);
  }

  // ───────────────────────────── music ─────────────────────────────

  private schedule = () => {
    const c = this.context;
    if (!c || !this.enabled || c.state !== "running") return;
    const now = c.currentTime,
      horizon = now + LOOKAHEAD;
    if (this.beat < now + 0.03) this.beat = now + 0.1;
    while (this.beat < horizon) this.beat += this.playStep(this.beat);
    if (this.critter < now) this.critter = now + 1.5 + this.wild() * 4;
    while (this.critter < horizon) {
      this.callCritter(this.critter);
      this.critter += (this.open ? 6 : 3.5) + this.wild() * 7;
    }
  };
  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)];
  }
  /** Plays one swung eighth-note step and returns its length. */
  private playStep(t: number) {
    const mood = this.open ? TENSE : CALM,
      length = 30 / mood.bpm,
      inBar = this.tick % 8,
      inPhrase = this.tick % 16;
    if (inBar === 0) {
      const bar = Math.floor(this.tick / 8) % 4;
      if (bar === 0 || this.progressionMood !== mood) {
        this.progression = this.pick(mood.progressions);
        this.progressionMood = mood;
      }
      this.chord = CHORDS[this.progression[bar]];
      this.pad(t, length * 8);
      if (inPhrase === 0) this.phrase = this.compose();
    }
    const at = t + (inBar % 2 ? length * mood.swing : 0);
    if (mood.bass.includes(inBar))
      this.mallet(
        at,
        this.chord.bass + (inBar === 4 ? 7 : 0),
        inBar ? 0.055 : 0.08,
        "marimba",
        0,
      );
    const index = this.phrase[inPhrase];
    if (index !== null && index !== undefined) {
      const note = this.fit(mood.scale, index, inBar),
        accent = inBar % 4 === 0 ? 1 : inBar % 2 ? 0.7 : 0.85;
      this.mallet(
        at,
        note,
        0.15 * accent * (0.85 + this.rand() * 0.3),
        mood.timbre,
        (this.rand() - 0.5) * 0.5,
      );
      if (mood === CALM && this.rand() < 0.07)
        this.mallet(at + length, note + 12, 0.035, "box", 0.3);
    }
    if (this.open && inBar % 4 === 0) this.heartbeat(t);
    this.tick++;
    return length;
  }
  /** Two-bar phrase of scale indices; echoes, sequences and rests keep it musical. */
  private compose(): (number | null)[] {
    const r = this.rand,
      clamp = (n: number) => Math.max(0, Math.min(9, n)),
      previous = this.phrase.some((n) => n !== null);
    if (previous && r() < 0.3)
      return this.phrase.map((n, i) =>
        n === null || i < 12 ? n : clamp(n + this.pick([-2, -1, 1, 2])),
      );
    // Breathe now and then, but never twice in a row (or at the very start).
    if (previous && r() < 0.08) return Array<number | null>(16).fill(null);
    const sparse = previous && r() < 0.22,
      first = this.pick(RHYTHMS),
      second = r() < 0.5 ? first : this.pick(RHYTHMS),
      shift = this.pick([-2, -1, 1, 2]);
    let degree = 2 + Math.floor(r() * 5);
    const out: (number | null)[] = [];
    for (let i = 0; i < 16; i++) {
      const bar = i >> 3,
        s = i & 7,
        echo = out[s];
      if (!(bar ? second : first)[s] || (sparse && r() < 0.55)) out.push(null);
      else if (bar && first === second && echo !== null && echo !== undefined)
        out.push(clamp(echo + shift));
      else {
        degree = clamp(
          degree + this.pick(STEPS) - (degree > 6 ? 1 : degree < 2 ? -1 : 0),
        );
        out.push(degree);
      }
    }
    return out;
  }
  /** Strong beats land on a chord tone of the current bar. */
  private fit(scale: number[], index: number, inBar: number) {
    const note = scale[index];
    if (inBar % 4 || this.chord.tones.includes(note % 12)) return note;
    for (const k of [index + 1, index - 1, index + 2, index - 2]) {
      const near = scale[k];
      if (near !== undefined && this.chord.tones.includes(near % 12))
        return near;
    }
    return note;
  }
  private mallet(
    t: number,
    note: number,
    level: number,
    timbre: "box" | "marimba",
    pan: number,
  ) {
    const v = this.voice("music", { at: t, pan });
    if (!v) return;
    const f = midi(note);
    if (timbre === "box") {
      this.tone(v, { f, a: 0.003, d: 1.5, v: level });
      this.tone(v, { f: f * 4.07, a: 0.002, d: 0.25, v: level * 0.35 });
    } else {
      this.tone(v, { f, a: 0.004, d: 0.75, v: level * 1.1 });
      this.tone(v, { f: f * 3.94, a: 0.002, d: 0.06, v: level * 0.3 });
    }
  }
  private pad(t: number, length: number) {
    const v = this.voice("pad", { at: t });
    if (!v) return;
    for (const note of this.chord.pad)
      this.tone(v, {
        w: "triangle",
        f: midi(note),
        det: (this.rand() - 0.5) * 14,
        a: 0.9,
        h: Math.max(0, length - 1.2),
        d: 2.2,
        v: 0.022,
      });
  }
  private heartbeat(t: number) {
    const v = this.voice("music", { at: t });
    if (!v) return;
    this.tone(v, { f: 66, to: 44, a: 0.008, d: 0.22, v: 0.24 });
    this.tone(v, { w: "triangle", f: 132, to: 90, a: 0.006, d: 0.1, v: 0.04 });
    this.tone(v, { f: 62, to: 42, at: 0.19, a: 0.008, d: 0.2, v: 0.15 });
  }
  /** Occasional FM bird chirps (more in town) or soft crickets (more in the wilds). */
  private callCritter(t: number) {
    const r = this.wild,
      v = this.voice("music", {
        at: t,
        pan: (r() - 0.5) * 1.3,
        gain: 0.5 + r() * 0.5,
      });
    if (!v) return;
    if (r() < (this.open ? 0.35 : 0.75)) {
      const count = 2 + Math.floor(r() * 4),
        base = 2500 + r() * 1600,
        falling = r() < 0.5,
        gap = 0.075 + r() * 0.06;
      for (let i = 0; i < count; i++) {
        const f = base * (0.92 + r() * 0.16);
        this.tone(v, {
          f: falling ? f * 1.35 : f * 0.8,
          to: falling ? f * 0.8 : f * 1.3,
          g: 0.05,
          at: i * gap,
          a: 0.006,
          d: 0.07,
          v: 0.06,
          fm: [55 + r() * 60, f * 0.04],
        });
      }
      return;
    }
    const o = v.c.createOscillator(),
      flutter = v.c.createOscillator(),
      depth = v.c.createGain(),
      am = v.c.createGain(),
      env = v.c.createGain();
    o.frequency.value = 4300 + r() * 900;
    flutter.type = "triangle";
    flutter.frequency.value = 28 + r() * 8;
    depth.gain.value = 0.5;
    am.gain.value = 0.5;
    flutter.connect(depth).connect(am.gain);
    env.gain.value = 0;
    let at = t;
    for (let i = 0, n = 2 + Math.floor(r() * 2); i < n; i++, at += 0.27) {
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.025, at + 0.02);
      env.gain.setValueAtTime(0.025, at + 0.14);
      env.gain.linearRampToValueAtTime(0, at + 0.17);
    }
    o.connect(am).connect(env).connect(v.out);
    v.nodes.push(depth, am, env);
    this.run(v, o, t, at);
    this.run(v, flutter, t, at);
  }
  /** A two-note cue when crossing the safe line. */
  private sting(open: boolean) {
    const v = this.voice("wet", { pan: 0, gain: 1 });
    if (!v) return;
    if (open) {
      this.tone(v, { f: midi(62), a: 0.003, d: 0.6, v: 0.09 });
      this.tone(v, { f: midi(57), at: 0.18, a: 0.003, d: 0.9, v: 0.09 });
      this.tone(v, { f: 58, to: 42, at: 0.18, a: 0.01, d: 0.3, v: 0.2 });
    } else {
      this.tone(v, { f: midi(72), a: 0.003, d: 0.7, v: 0.07 });
      this.tone(v, { f: midi(77), at: 0.12, a: 0.003, d: 1, v: 0.07 });
      this.tone(v, { f: midi(77) * 4.07, at: 0.12, d: 0.15, v: 0.012 });
    }
  }

  // ───────────────────────────── combat cues ─────────────────────────────

  private cue(
    e: CombatEvent,
    source: ActorView,
    actors: ActorView[],
    self: string,
  ) {
    const wolf = source.kind === "wolf",
      cyborg = !wolf && source.guild === "cyborg",
      guard = source.kind === "guard";
    switch (e.type) {
      case "cast":
        if (wolf) this.growl();
        else if (cyborg) this.cyborgWindup(e.key);
        else this.knightWindup(e.key, guard);
        return;
      case "resolve":
        if (wolf) this.bite();
        else if (cyborg) this.cyborgAction(e.key);
        else this.knightAction(e.key, guard);
        return;
      case "hit":
        return this.impact(e, wolf, cyborg, guard, actors, self);
      case "miss":
        return this.whiff();
      case "dodge":
        return e.key === "c" ? this.breakFree() : this.evade();
      case "death":
        return this.poof(
          actors.find((a) => a.id === e.target)?.kind === "wolf",
        );
      case "loot":
        return this.coins();
      case "level":
        return this.fanfare();
      case "heal":
        return e.key === "revive" ? this.sparkle() : this.twinkle();
    }
  }
  private knightWindup(key: string, guard: boolean) {
    const v = this.voice("dry");
    if (!v) return;
    if (key === "basic" && guard)
      this.hiss(v, { f: 500, to: 1500, q: 1.2, a: 0.6, d: 0.1, v: 0.3 });
    else if (key === "basic" || key === "2") {
      this.hiss(v, { f: 1200, q: 1, a: 0.02, d: 0.06, v: 0.16 });
      if (key === "2")
        this.tone(v, {
          w: "triangle",
          f: 300,
          to: 420,
          a: 0.01,
          d: 0.09,
          v: 0.08,
        });
    } else if (key === "1") {
      this.hiss(v, { f: 400, to: 1600, q: 1.2, a: 0.35, d: 0.1, v: 0.45 });
      this.tone(v, {
        w: "triangle",
        f: 260,
        to: 340,
        a: 0.02,
        d: 0.1,
        v: 0.1,
      });
    } else if (key === "5") {
      this.hiss(v, {
        type: "highpass",
        f: 4000,
        to: 9000,
        a: 0.6,
        d: 0.1,
        v: 0.08,
      });
      this.tone(v, { f: 523, to: 784, a: 0.6, d: 0.1, v: 0.05 });
    } else if (key === "r") {
      const lfo = this.lfo(v, 5, 12, v.t, v.t + 0.95);
      for (const note of [53, 60, 65])
        lfo.connect(
          this.tone(v, { f: midi(note), a: 0.55, d: 0.35, v: 0.06 }).detune,
        );
      this.hiss(v, { f: 1200, to: 4000, q: 0.8, a: 0.55, d: 0.15, v: 0.14 });
    } else this.hiss(v, { f: 1500, q: 1, a: 0.015, d: 0.05, v: 0.08 });
  }
  private knightAction(key: string, guard: boolean) {
    if (key === "basic" || key === "1" || key === "2")
      return this.swish(guard || key === "1");
    const v = this.voice(key === "q" ? "dry" : "wet");
    if (!v) return;
    if (key === "3") {
      // Challenge: a little toy horn "toot-tooo".
      for (const [at, f, h, d, level] of [
        [0, 349, 0.05, 0.1, 0.07],
        [0.15, 466, 0.2, 0.3, 0.085],
      ]) {
        this.tone(v, {
          w: "sawtooth",
          f: f * 0.94,
          to: f,
          g: 0.05,
          at,
          a: 0.025,
          h,
          d,
          v: level,
          lp: 1700,
          q: 1.2,
          vib: [6, at ? 16 : 4],
        });
        this.tone(v, { w: "triangle", f: f / 2, at, a: 0.02, h, d, v: level });
      }
    } else if (key === "4") {
      this.tone(v, { f: 330, to: 495, g: 0.15, a: 0.02, d: 0.4, v: 0.16 });
      this.tone(v, { f: 988, at: 0.09, d: 0.6, v: 0.06 });
      this.tone(v, { f: 1480, at: 0.15, d: 0.6, v: 0.05 });
    } else if (key === "5") this.arpeggio(v);
    else if (key === "r") {
      // Last Oath: a choir-like swell of stacked, gently vibrating sines.
      const lfo = this.lfo(v, 5.2, 14, v.t, v.t + 2.3);
      for (const [note, level] of [
        [53, 0.05],
        [60, 0.045],
        [65, 0.045],
        [69, 0.04],
        [72, 0.035],
      ])
        lfo.connect(
          this.tone(v, {
            f: midi(note),
            det: (Math.random() - 0.5) * 10,
            a: 0.18,
            h: 0.5,
            d: 1.5,
            v: level,
          }).detune,
        );
      this.tone(v, {
        w: "sawtooth",
        f: midi(53),
        a: 0.2,
        h: 0.4,
        d: 1.2,
        v: 0.045,
        lp: 950,
        q: 3,
      });
      this.tone(v, { f: midi(89), at: 0.15, d: 1.2, v: 0.03 });
      this.hiss(v, {
        type: "highpass",
        f: 7000,
        a: 0.3,
        h: 0.3,
        d: 0.8,
        v: 0.05,
      });
    } else if (key === "q") {
      this.tone(v, {
        w: "triangle",
        f: 220,
        to: 150,
        a: 0.002,
        d: 0.1,
        v: 0.3,
      });
      this.hiss(v, { f: 900, q: 1.5, a: 0.002, d: 0.06, v: 0.45 });
      this.tone(v, { f: 1760, at: 0.02, a: 0.002, d: 0.3, v: 0.04 });
    } else this.hiss(v, { f: 1500, q: 1, a: 0.015, d: 0.05, v: 0.08 });
  }
  private cyborgWindup(key: string) {
    if (key === "basic" || key === "q") return;
    const v = this.voice("dry", { urgent: key === "1" });
    if (!v) return;
    if (key === "1") {
      // Pulse Lance charge: a wobbling whine that climbs into the zap.
      this.tone(v, {
        w: "sawtooth",
        f: 180,
        to: 1100,
        g: 0.62,
        a: 0.55,
        d: 0.12,
        v: 0.12,
        lp: 2200,
        vib: [24, 45],
      });
      this.hiss(v, { f: 2000, to: 7000, q: 1.5, a: 0.55, d: 0.1, v: 0.3 });
    } else if (key === "2") {
      this.tone(v, { f: 70, to: 140, a: 0.4, d: 0.12, v: 0.14, fm: [7, 12] });
      this.tone(v, {
        w: "triangle",
        f: 140,
        to: 280,
        a: 0.4,
        d: 0.1,
        v: 0.035,
      });
    } else if (key === "4")
      this.hiss(v, {
        type: "highpass",
        f: 2500,
        to: 5000,
        a: 0.35,
        d: 0.06,
        v: 0.08,
      });
    else if (key === "r") {
      this.tone(v, { f: 220, to: 520, a: 0.35, d: 0.08, v: 0.05 });
      this.hiss(v, { f: 1500, to: 5000, q: 1.2, a: 0.35, d: 0.06, v: 0.08 });
    } else
      this.tone(v, {
        w: "triangle",
        f: key === "5" ? 200 : 300,
        to: key === "5" ? 700 : 600,
        a: key === "5" ? 0.5 : 0.3,
        d: 0.1,
        v: 0.045,
      });
  }
  private cyborgAction(key: string) {
    const v = this.voice(
      key === "basic" || key === "2" || key === "3" || key === "q"
        ? "dry"
        : "wet",
    );
    if (!v) return;
    const r = vary();
    if (key === "basic") {
      // Pulse Tap "pew".
      this.tone(v, {
        w: "square",
        f: 1500 * r,
        to: 360 * r,
        g: 0.12,
        a: 0.002,
        d: 0.14,
        v: 0.08,
        lp: 3000,
      });
      this.tone(v, {
        f: 1800 * r,
        to: 500 * r,
        g: 0.1,
        a: 0.002,
        d: 0.12,
        v: 0.28,
      });
    } else if (key === "1") {
      // Pulse Lance zap.
      this.tone(v, {
        w: "sawtooth",
        f: 1900,
        to: 120,
        g: 0.32,
        a: 0.002,
        d: 0.36,
        v: 0.1,
        lp: 3800,
        fm: [70, 500],
      });
      this.tone(v, { f: 170, to: 48, g: 0.25, a: 0.003, d: 0.3, v: 0.4 });
      this.hiss(v, { f: 4800, to: 1400, q: 2.5, a: 0.002, d: 0.28, v: 0.4 });
    } else if (key === "2") {
      // Mag Clamp "vwoom": a resonant filter sweep over a wobbling buzz.
      this.tone(v, {
        w: "sawtooth",
        f: 95,
        to: 70,
        a: 0.03,
        h: 0.12,
        d: 0.35,
        v: 0.14,
        lp: 1900,
        lpTo: 220,
        q: 7,
        fm: [8, 9],
      });
      this.tone(v, { f: 190, to: 140, a: 0.03, h: 0.1, d: 0.3, v: 0.14 });
    } else if (key === "3") {
      // Arc Mine deployed: clack, then an arming beep-beep.
      this.hiss(v, { type: "highpass", f: 1800, a: 0.001, d: 0.035, v: 0.4 });
      this.tone(v, {
        w: "triangle",
        f: 240,
        to: 160,
        a: 0.001,
        d: 0.06,
        v: 0.18,
      });
      for (const at of [0.1, 0.24])
        this.tone(v, {
          w: "square",
          f: 1568,
          at,
          a: 0.002,
          h: 0.04,
          d: 0.05,
          v: 0.1,
          lp: 3500,
        });
    } else if (key === "4") {
      // Coolant Burst: frosty whoosh and crystal chimes.
      this.hiss(v, { f: 5200, to: 900, q: 0.8, a: 0.05, d: 0.45, v: 0.45 });
      for (let i = 0; i < 4; i++)
        this.tone(v, {
          f: midi([96, 98, 100, 103, 105][Math.floor(Math.random() * 5)]),
          at: 0.06 + i * 0.075,
          a: 0.002,
          d: 0.45,
          v: 0.035,
        });
    } else if (key === "5") {
      // Repair Drone: happy little beeps over a propeller whirr.
      [84, 91, 88, 96].forEach((note, i) =>
        this.tone(v, {
          w: "square",
          f: midi(note),
          to: midi(note) * 1.06,
          g: 0.05,
          at: i * 0.075,
          a: 0.003,
          h: 0.03,
          d: 0.06,
          v: 0.06,
          lp: 2800,
        }),
      );
      this.tone(v, {
        w: "triangle",
        f: 300,
        a: 0.05,
        h: 0.2,
        d: 0.2,
        v: 0.06,
        fm: [38, 60],
      });
    } else if (key === "r") {
      // Overclock: a rising power-up with a sparkling top.
      this.tone(v, {
        w: "sawtooth",
        f: 160,
        to: 1300,
        g: 0.5,
        a: 0.05,
        h: 0.4,
        d: 0.2,
        v: 0.07,
        lp: 2600,
        vib: [16, 35],
      });
      [72, 76, 79, 84, 88, 91].forEach((note, i) =>
        this.tone(v, {
          w: "square",
          f: midi(note),
          at: i * 0.06,
          a: 0.002,
          d: 0.05,
          v: 0.035,
          lp: 3000,
        }),
      );
      for (const note of [84, 91, 96])
        this.tone(v, { f: midi(note), at: 0.42, a: 0.005, d: 0.6, v: 0.05 });
    } else if (key === "q") {
      // Reactive Plating: a quick metallic shutter.
      for (const at of [0, 0.045, 0.09])
        this.hiss(v, { f: 3400 * vary(), q: 7, at, a: 0.001, d: 0.04, v: 1 });
      this.tone(v, {
        w: "triangle",
        f: 300,
        to: 190,
        at: 0.09,
        a: 0.001,
        d: 0.06,
        v: 0.2,
      });
      this.tone(v, { f: 1870, at: 0.09, a: 0.001, d: 0.3, v: 0.05 });
      this.tone(v, { f: 2630, at: 0.09, a: 0.001, d: 0.22, v: 0.035 });
    }
  }
  /** Blade swish: band-passed noise sweep plus a light metallic pluck. */
  private swish(heavy: boolean) {
    const v = this.voice("dry");
    if (!v) return;
    const r = vary();
    this.hiss(v, {
      f: (heavy ? 1900 : 2800) * r,
      to: heavy ? 320 : 700,
      q: 1.3,
      a: 0.035,
      d: heavy ? 0.22 : 0.14,
      v: heavy ? 1.1 : 0.9,
    });
    this.tone(v, {
      w: "triangle",
      f: 1320 * r,
      to: 1180 * r,
      at: 0.03,
      a: 0.002,
      d: 0.09,
      v: 0.05,
    });
  }
  private impact(
    e: CombatEvent,
    wolf: boolean,
    cyborg: boolean,
    guard: boolean,
    actors: ActorView[],
    self: string,
  ) {
    const victim = actors.find((a) => a.id === e.target),
      mine = e.target === self,
      base = mine ? 240 : victim?.kind === "wolf" ? 420 : 320,
      knight = !wolf && !cyborg;
    if (e.blocked) {
      this.clang();
      this.bonk(base, 1, 0.45, mine);
      return;
    }
    if (cyborg && e.key === "3") this.boom();
    else if (cyborg && e.key === "1") this.crackle();
    else if (cyborg && e.key === "2") this.clamped();
    else if (knight && e.key === "1") this.crunch();
    else if (knight && e.key === "2") this.boing();
    this.bonk(base, knight && (e.key === "1" || guard) ? 1.4 : 1, 1, mine);
  }
  /** Hit "bonk/pop": a pitched body that drops, a little pop and a click. */
  private bonk(base: number, weight: number, level: number, urgent: boolean) {
    if (!this.fresh("bonk", 0.03)) return;
    const v = this.voice("dry", { urgent });
    if (!v) return;
    const f = base * vary(0.08);
    this.tone(v, {
      f,
      to: f * 0.45,
      g: 0.1,
      a: 0.002,
      d: 0.16 * weight,
      v: 0.45 * level,
    });
    this.tone(v, {
      w: "triangle",
      f: f * 2.4,
      to: f * 1.2,
      g: 0.04,
      a: 0.001,
      d: 0.05,
      v: 0.1 * level,
    });
    this.hiss(v, {
      type: "highpass",
      f: 3200,
      a: 0.001,
      d: 0.018,
      v: 0.3 * level,
    });
  }
  /** Blocked hit: a bright, inharmonic clang and a high ping. */
  private clang() {
    const v = this.voice("wet");
    if (!v) return;
    const f = 1180 * vary(0.05);
    for (const [ratio, level, decay] of [
      [1, 0.12, 0.4],
      [1.51, 0.08, 0.3],
      [2.13, 0.06, 0.22],
      [2.92, 0.035, 0.16],
    ])
      this.tone(v, { f: f * ratio, a: 0.001, d: decay, v: level });
    this.hiss(v, { type: "highpass", f: 4000, a: 0.001, d: 0.03, v: 0.25 });
    this.tone(v, { f: 2794, at: 0.025, a: 0.002, d: 0.55, v: 0.045 });
  }
  /** Sunder: a heavy thump with a gravelly crunch. */
  private crunch() {
    const v = this.voice("dry");
    if (!v) return;
    this.tone(v, { f: 118, to: 40, g: 0.25, a: 0.003, d: 0.32, v: 0.7 });
    this.hiss(v, {
      type: "lowpass",
      f: 3200,
      to: 380,
      q: 0.9,
      a: 0.002,
      d: 0.22,
      v: 0.55,
    });
    this.hiss(v, { f: 1400, q: 2.5, at: 0.035, a: 0.002, d: 0.1, v: 0.4 });
    this.hiss(v, { f: 900, q: 2.5, at: 0.07, a: 0.002, d: 0.08, v: 0.3 });
  }
  /** Shield Bash: a springy "boing" and a clang. */
  private boing() {
    const v = this.voice("wet");
    if (!v) return;
    this.tone(v, {
      f: 150,
      to: 360,
      g: 0.28,
      a: 0.004,
      d: 0.45,
      v: 0.3,
      vib: [14, 140],
    });
    this.tone(v, {
      w: "triangle",
      f: 300,
      to: 720,
      g: 0.28,
      a: 0.004,
      d: 0.3,
      v: 0.06,
    });
    for (const [ratio, level] of [
      [1, 0.09],
      [1.5, 0.06],
      [2.24, 0.04],
    ])
      this.tone(v, { f: 880 * ratio, a: 0.001, d: 0.3, v: level });
  }
  /** Arc Mine detonation: a cartoon boom with electric crackles (once per blast). */
  private boom() {
    if (!this.fresh("boom", 0.15)) return;
    const v = this.voice("dry", { urgent: true });
    if (!v) return;
    this.tone(v, { f: 150, to: 38, g: 0.45, a: 0.004, d: 0.6, v: 0.7 });
    this.hiss(v, {
      type: "lowpass",
      f: 2600,
      to: 160,
      q: 0.8,
      a: 0.004,
      d: 0.7,
      v: 0.6,
    });
    this.tone(v, {
      w: "triangle",
      f: 620,
      to: 130,
      g: 0.1,
      a: 0.002,
      d: 0.12,
      v: 0.12,
    });
    this.hiss(v, { f: 5200, q: 4, at: 0.06, a: 0.001, d: 0.1, v: 0.3 });
    this.hiss(v, { f: 3800, q: 4, at: 0.16, a: 0.001, d: 0.08, v: 0.25 });
  }
  /** Pulse Lance contact: a short electric crackle (once per pierce). */
  private crackle() {
    if (!this.fresh("crackle", 0.1)) return;
    const v = this.voice("dry");
    if (!v) return;
    this.hiss(v, { f: 4200, q: 3, a: 0.001, d: 0.12, v: 0.35 });
    this.tone(v, {
      w: "square",
      f: 880,
      to: 220,
      a: 0.001,
      d: 0.1,
      v: 0.03,
      lp: 2500,
      fm: [60, 300],
    });
  }
  /** Mag Clamp contact: a magnetic clink and buzz. */
  private clamped() {
    const v = this.voice("dry");
    if (!v) return;
    this.tone(v, { f: 1250, to: 1500, g: 0.05, a: 0.001, d: 0.15, v: 0.06 });
    this.tone(v, {
      w: "sawtooth",
      f: 62,
      a: 0.005,
      h: 0.08,
      d: 0.2,
      v: 0.08,
      lp: 500,
    });
  }
  private whiff() {
    if (!this.fresh("whiff", 0.05)) return;
    const v = this.voice("dry");
    if (v) this.hiss(v, { f: 1500, to: 500, q: 1, a: 0.02, d: 0.12, v: 0.35 });
  }
  private evade() {
    const v = this.voice("dry");
    if (!v) return;
    this.hiss(v, { f: 650, to: 2900, q: 1.3, a: 0.04, d: 0.24, v: 0.8 });
    this.tone(v, { f: 520, to: 1150, g: 0.12, a: 0.01, d: 0.13, v: 0.07 });
  }
  /** Break Free: chain links clink, snap, and a springy release. */
  private breakFree() {
    const v = this.voice("wet");
    if (!v) return;
    [2210, 2560, 1980].forEach((f, i) => {
      this.tone(v, { f, at: i * 0.05, a: 0.001, d: 0.1, v: 0.05 });
      this.tone(v, { f: f * 1.48, at: i * 0.05, a: 0.001, d: 0.06, v: 0.025 });
    });
    this.hiss(v, {
      type: "highpass",
      f: 2400,
      at: 0.16,
      a: 0.001,
      d: 0.07,
      v: 0.5,
    });
    this.tone(v, {
      f: 300,
      to: 950,
      g: 0.18,
      at: 0.17,
      a: 0.004,
      d: 0.22,
      v: 0.08,
    });
  }
  /** Briar Hound telegraph: a low, rumbly FM growl that fills the wind-up. */
  private growl() {
    const v = this.voice("dry", { urgent: true });
    if (!v) return;
    this.tone(v, {
      w: "sawtooth",
      f: 78,
      to: 98,
      g: 0.5,
      a: 0.12,
      h: 0.32,
      d: 0.25,
      v: 0.22,
      lp: 650,
      q: 2,
      fm: [31, 26],
    });
    this.tone(v, {
      w: "triangle",
      f: 156,
      to: 190,
      g: 0.5,
      a: 0.1,
      h: 0.3,
      d: 0.2,
      v: 0.08,
      fm: [23, 30],
    });
    this.hiss(v, { f: 320, q: 2.5, a: 0.1, h: 0.3, d: 0.2, v: 0.2 });
  }
  /** Briar Hound bite: snap-snap of little jaws. */
  private bite() {
    const v = this.voice("dry", { urgent: true });
    if (!v) return;
    this.hiss(v, { type: "highpass", f: 2600, a: 0.001, d: 0.025, v: 0.45 });
    this.tone(v, {
      w: "square",
      f: 440,
      to: 150,
      g: 0.06,
      a: 0.002,
      d: 0.08,
      v: 0.07,
      lp: 1600,
    });
    this.hiss(v, {
      type: "highpass",
      f: 3400,
      at: 0.06,
      a: 0.001,
      d: 0.02,
      v: 0.35,
    });
  }
  /** Death: a cartoon smoke "poof" and a descending wah; creatures leave a twinkle. */
  private poof(creature: boolean) {
    const v = this.voice("wet");
    if (!v) return;
    this.hiss(v, {
      type: "lowpass",
      f: 2400,
      to: 260,
      q: 0.8,
      a: 0.015,
      d: 0.45,
      v: 0.55,
    });
    this.hiss(v, { f: 700, q: 1.2, a: 0.01, d: 0.25, v: 0.3 });
    const top = creature ? 660 : 494;
    this.tone(v, {
      w: "sawtooth",
      f: top,
      to: top / 3,
      g: 0.8,
      at: 0.1,
      a: 0.02,
      h: 0.12,
      d: 0.6,
      v: 0.07,
      lp: 1500,
      wah: [5.5, 700],
    });
    if (creature)
      [96, 100, 103].forEach((note, i) =>
        this.tone(v, { f: midi(note), at: 0.55 + i * 0.07, d: 0.3, v: 0.025 }),
      );
  }
  /** Loot: the classic two-step coin "ding-ding". */
  private coins() {
    const v = this.voice("wet");
    if (!v) return;
    for (const [at, f, h, d] of [
      [0, 988, 0, 0.07],
      [0.08, 1319, 0.05, 0.45],
    ]) {
      this.tone(v, { w: "square", f, at, a: 0.002, h, d, v: 0.03, lp: 4000 });
      this.tone(v, { f, at, a: 0.002, h, d: d + 0.05, v: 0.06 });
    }
  }
  /** Level up: a bright fanfare arpeggio resolving onto a held, shimmering chord. */
  private fanfare() {
    const v = this.voice("wet");
    if (!v) return;
    [65, 69, 72, 77].forEach((note, i) => {
      const f = midi(note),
        at = i * 0.09;
      this.tone(v, {
        w: "triangle",
        f,
        at,
        a: 0.004,
        h: 0.05,
        d: 0.18,
        v: 0.1,
      });
      this.tone(v, {
        w: "square",
        f,
        at,
        a: 0.004,
        h: 0.05,
        d: 0.12,
        v: 0.03,
        lp: 2500,
      });
    });
    const lfo = this.lfo(v, 6, 10, v.t + 0.38, v.t + 1.65);
    for (const note of [77, 81, 84])
      lfo.connect(
        this.tone(v, {
          w: "triangle",
          f: midi(note),
          at: 0.38,
          a: 0.01,
          h: 0.3,
          d: 0.9,
          v: 0.07,
        }).detune,
      );
    this.hiss(v, {
      type: "highpass",
      f: 7000,
      at: 0.38,
      a: 0.02,
      d: 0.7,
      v: 0.08,
    });
  }
  /** Rally and revive: a quick music-box sparkle arpeggio. */
  private sparkle() {
    const v = this.voice("wet");
    if (v) this.arpeggio(v);
  }
  private arpeggio(v: Voice) {
    [77, 81, 84, 89].forEach((note, i) =>
      this.tone(v, {
        w: "triangle",
        f: midi(note),
        at: i * 0.065,
        a: 0.002,
        d: 0.7,
        v: 0.09,
      }),
    );
    this.hiss(v, {
      type: "highpass",
      f: 6500,
      at: 0.05,
      a: 0.08,
      d: 0.45,
      v: 0.09,
    });
  }
  /** Heal tick: two soft high twinkles. */
  private twinkle() {
    if (!this.fresh("twinkle", 0.2)) return;
    const v = this.voice("wet");
    if (!v) return;
    const notes = [84, 86, 89, 91, 93],
      first = notes[Math.floor(Math.random() * 5)],
      second = notes[Math.floor(Math.random() * 5)];
    this.tone(v, { f: midi(first), a: 0.003, d: 0.35, v: 0.035 });
    this.tone(v, { f: midi(second), at: 0.07, a: 0.003, d: 0.4, v: 0.03 });
  }
}
