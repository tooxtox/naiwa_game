/**
 * Procedural sound-effect bank for LUMENFALL.
 *
 * Every effect is synthesised from scratch (oscillators, filtered noise and
 * envelopes) and written as 16-bit mono WAV, so the repository stays free of
 * binary audio dependencies while the game still ships a real sound bank.
 *
 * Usage: node scripts/make-sfx.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 44100;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Attack / exponential decay envelope with an explicit tail fade. */
const envelope = (t, dur, attack, decay) => {
  if (t < 0 || t >= dur) return 0;
  if (t < attack) return attack > 0 ? t / attack : 1;
  return Math.exp(-(t - attack) / decay);
};

/** Chamberlin state-variable filter: one instance per voice, applied in place. */
const filterVoice = (samples, { type = 'lowpass', cutoff = 12000, cutoffEnd, q = 1 } = {}) => {
  let low = 0;
  let band = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length;
    const cutoffNow = cutoffEnd === undefined ? cutoff : cutoff + (cutoffEnd - cutoff) * t;
    const f = 2 * Math.sin((Math.PI * clamp(cutoffNow, 20, RATE * 0.45)) / RATE);
    const high = samples[i] - low - band / q;
    band += f * high;
    low += f * band;
    if (type === 'lowpass') samples[i] = low;
    else if (type === 'highpass') samples[i] = high;
    else samples[i] = band;
  }
  return samples;
};

const oscillators = {
  sine: (phase) => Math.sin(phase * Math.PI * 2),
  square: (phase) => (phase % 1 < 0.5 ? 1 : -1),
  saw: (phase) => 2 * (phase % 1) - 1,
  triangle: (phase) => 4 * Math.abs((phase % 1) - 0.5) - 1,
};

/**
 * Renders one voice into a buffer.
 * @param {{wave?:string,f0:number,f1?:number,gain?:number,attack?:number,decay?:number,filter?:object}} options
 */
const voice = (options) => {
  const { wave = 'sine', f0, f1 = f0, gain = 1, attack = 0.004, decay = 0.12, filter } = options;
  const samples = new Float32Array(Math.max(1, Math.round(options.length * RATE)));
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / samples.length;
    const freq = f0 + (f1 - f0) * t;
    phase += freq / RATE;
    samples[i] = oscillators[wave](phase) * envelope(i / RATE, samples.length / RATE, attack, decay);
  }
  // An unfiltered oscillator must bypass the filter. Its former implicit
  // 12 kHz cutoff made this state-variable filter diverge and render silence.
  if (filter) filterVoice(samples, filter);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
};

/** Filtered noise burst, used for whooshes, impacts and air. */
const noise = ({ length, gain = 1, attack = 0.002, decay = 0.08, filter } = {}) => {
  const samples = new Float32Array(Math.max(1, Math.round(length * RATE)));
  let seed = 0x2f6e2b1;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = (seed / 0xffffffff) * 2 - 1;
    samples[i] = white * envelope(i / RATE, samples.length / RATE, attack, decay);
  }
  if (filter) filterVoice(samples, filter);
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
};

/** Mixes a voice into the master buffer at a given offset. */
const mix = (master, source, offset = 0, gain = 1) => {
  const start = Math.round(offset * RATE);
  for (let i = 0; i < source.length; i++) {
    const index = start + i;
    if (index < 0 || index >= master.length) continue;
    master[index] += source[i] * gain;
  }
  return master;
};

/** Fades the tail so every file ends on zero and never clicks. */
const fadeEdges = (samples, fade = 0.006) => {
  const edge = Math.min(Math.floor(fade * RATE), Math.floor(samples.length / 2));
  for (let i = 0; i < edge; i++) {
    samples[i] *= i / edge;
    samples[samples.length - 1 - i] *= i / edge;
  }
  return samples;
};

const normalise = (samples, peak = 0.92) => {
  let max = 0;
  for (const value of samples) {
    if (!Number.isFinite(value)) throw new Error('SFX synthesis produced a non-finite sample');
    max = Math.max(max, Math.abs(value));
  }
  if (max < 0.0001) throw new Error('SFX synthesis produced a silent buffer');
  const scale = peak / max;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
};

const toWav = (samples) => {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples.length * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(RATE, 24);
  bytes.writeUInt32LE(RATE * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = clamp(samples[i], -1, 1);
    bytes.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return bytes;
};

/* ------------------------------------------------------------------ */
/* Sound definitions                                                   */
/* ------------------------------------------------------------------ */

const definitions = {
  /** Melee swing: a wide band of air pushed past the blade. */
  'sfx-swing': () => {
    const master = new Float32Array(Math.round(0.24 * RATE));
    mix(master, noise({ length: 0.24, gain: 0.85, attack: 0.012, decay: 0.07, filter: { type: 'bandpass', cutoff: 700, cutoffEnd: 2600, q: 1.6 } }));
    mix(master, noise({ length: 0.18, gain: 0.35, attack: 0.004, decay: 0.05, filter: { type: 'highpass', cutoff: 2200 } }), 0.05);
    return normalise(fadeEdges(master), 0.8);
  },
  /** Projectile launch: a short downward blip with an air crack. */
  'sfx-shoot': () => {
    const master = new Float32Array(Math.round(0.2 * RATE));
    mix(master, voice({ length: 0.2, wave: 'sine', f0: 980, f1: 320, gain: 0.55, attack: 0.002, decay: 0.05 }));
    mix(master, voice({ length: 0.12, wave: 'triangle', f0: 1960, f1: 620, gain: 0.25, attack: 0.001, decay: 0.04 }));
    mix(master, noise({ length: 0.09, gain: 0.3, attack: 0.001, decay: 0.03, filter: { type: 'highpass', cutoff: 2600 } }));
    return normalise(fadeEdges(master), 0.72);
  },
  /** Solid hit: a low body thud with a click on top. */
  'sfx-hit': () => {
    const master = new Float32Array(Math.round(0.18 * RATE));
    mix(master, voice({ length: 0.18, wave: 'sine', f0: 340, f1: 70, gain: 0.9, attack: 0.001, decay: 0.045 }));
    mix(master, voice({ length: 0.07, wave: 'square', f0: 420, f1: 160, gain: 0.3, attack: 0.001, decay: 0.02, filter: { type: 'lowpass', cutoff: 2200 } }));
    mix(master, noise({ length: 0.08, gain: 0.4, attack: 0.001, decay: 0.025, filter: { type: 'bandpass', cutoff: 1800, q: 1.1 } }));
    return normalise(fadeEdges(master), 0.85);
  },
  /** Critical hit: bright metallic spark over the regular impact. */
  'sfx-crit': () => {
    const master = new Float32Array(Math.round(0.34 * RATE));
    mix(master, voice({ length: 0.34, wave: 'sine', f0: 1760, f1: 1560, gain: 0.5, attack: 0.001, decay: 0.11 }));
    mix(master, voice({ length: 0.28, wave: 'sine', f0: 2640, f1: 2380, gain: 0.3, attack: 0.001, decay: 0.08 }));
    mix(master, voice({ length: 0.12, wave: 'sine', f0: 300, f1: 90, gain: 0.6, attack: 0.001, decay: 0.04 }));
    mix(master, noise({ length: 0.14, gain: 0.45, attack: 0.001, decay: 0.045, filter: { type: 'highpass', cutoff: 3200 } }));
    return normalise(fadeEdges(master), 0.9);
  },
  /** Enemy destroyed: a short collapsing burst. */
  'sfx-kill': () => {
    const master = new Float32Array(Math.round(0.4 * RATE));
    mix(master, voice({ length: 0.4, wave: 'saw', f0: 420, f1: 70, gain: 0.5, attack: 0.002, decay: 0.12, filter: { type: 'lowpass', cutoff: 2400, cutoffEnd: 500 } }));
    mix(master, voice({ length: 0.3, wave: 'sine', f0: 160, f1: 48, gain: 0.6, attack: 0.002, decay: 0.1 }));
    mix(master, noise({ length: 0.34, gain: 0.5, attack: 0.002, decay: 0.11, filter: { type: 'bandpass', cutoff: 2400, cutoffEnd: 400, q: 1.2 } }));
    return normalise(fadeEdges(master), 0.85);
  },
  /** Dash: air rushing past the hero. */
  'sfx-dash': () => {
    const master = new Float32Array(Math.round(0.32 * RATE));
    mix(master, noise({ length: 0.32, gain: 0.8, attack: 0.014, decay: 0.11, filter: { type: 'bandpass', cutoff: 380, cutoffEnd: 3000, q: 1.7 } }));
    mix(master, noise({ length: 0.22, gain: 0.3, attack: 0.01, decay: 0.09, filter: { type: 'highpass', cutoff: 1800 } }), 0.06);
    return normalise(fadeEdges(master), 0.7);
  },
  /** Guard block: a dull metallic clang. */
  'sfx-guard': () => {
    const master = new Float32Array(Math.round(0.36 * RATE));
    for (const [freq, gain, decay] of [[520, 0.5, 0.13], [790, 0.36, 0.1], [1180, 0.24, 0.08], [1670, 0.16, 0.06]]) {
      mix(master, voice({ length: 0.36, wave: 'sine', f0: freq, f1: freq * 0.97, gain, attack: 0.001, decay }), 0, 1);
    }
    mix(master, noise({ length: 0.12, gain: 0.4, attack: 0.001, decay: 0.035, filter: { type: 'bandpass', cutoff: 2600, q: 1.2 } }));
    return normalise(fadeEdges(master), 0.82);
  },
  /** Perfect parry: a clean, ringing chime. */
  'sfx-parry': () => {
    const master = new Float32Array(Math.round(0.62 * RATE));
    mix(master, voice({ length: 0.62, wave: 'sine', f0: 1320, f1: 1310, gain: 0.55, attack: 0.002, decay: 0.22 }));
    mix(master, voice({ length: 0.5, wave: 'sine', f0: 1980, f1: 1965, gain: 0.32, attack: 0.002, decay: 0.16 }));
    mix(master, voice({ length: 0.3, wave: 'sine', f0: 2640, f1: 2620, gain: 0.18, attack: 0.002, decay: 0.1 }));
    mix(master, noise({ length: 0.2, gain: 0.35, attack: 0.001, decay: 0.05, filter: { type: 'highpass', cutoff: 3400 } }));
    return normalise(fadeEdges(master), 0.9);
  },
  /** Hero hurt: a muffled, heavy thump. */
  'sfx-hurt': () => {
    const master = new Float32Array(Math.round(0.34 * RATE));
    mix(master, voice({ length: 0.34, wave: 'saw', f0: 260, f1: 62, gain: 0.7, attack: 0.002, decay: 0.1, filter: { type: 'lowpass', cutoff: 1500, cutoffEnd: 380 } }));
    mix(master, voice({ length: 0.22, wave: 'sine', f0: 120, f1: 44, gain: 0.6, attack: 0.002, decay: 0.09 }));
    mix(master, noise({ length: 0.16, gain: 0.35, attack: 0.001, decay: 0.05, filter: { type: 'lowpass', cutoff: 1800 } }));
    return normalise(fadeEdges(master), 0.88);
  },
  /** Ultimate: a deep detonation with a rising shimmer. */
  'sfx-ultimate': () => {
    const master = new Float32Array(Math.round(1.15 * RATE));
    mix(master, voice({ length: 1.15, wave: 'sine', f0: 150, f1: 38, gain: 0.95, attack: 0.006, decay: 0.42 }));
    mix(master, voice({ length: 0.7, wave: 'saw', f0: 90, f1: 44, gain: 0.4, attack: 0.004, decay: 0.22, filter: { type: 'lowpass', cutoff: 1200, cutoffEnd: 260 } }));
    mix(master, noise({ length: 0.85, gain: 0.55, attack: 0.02, decay: 0.3, filter: { type: 'lowpass', cutoff: 5200, cutoffEnd: 400 } }));
    mix(master, voice({ length: 0.6, wave: 'triangle', f0: 620, f1: 1860, gain: 0.22, attack: 0.08, decay: 0.2 }));
    return normalise(fadeEdges(master), 0.95);
  },
  /** Blessing gained: a warm three-note rise. */
  'sfx-upgrade': () => {
    const master = new Float32Array(Math.round(0.86 * RATE));
    const notes = [523.25, 659.25, 987.77];
    notes.forEach((freq, index) => {
      mix(master, voice({ length: 0.7, wave: 'sine', f0: freq, f1: freq, gain: 0.45, attack: 0.006, decay: 0.2 }), index * 0.11);
      mix(master, voice({ length: 0.55, wave: 'triangle', f0: freq * 2, f1: freq * 2, gain: 0.16, attack: 0.006, decay: 0.14 }), index * 0.11);
    });
    mix(master, noise({ length: 0.3, gain: 0.2, attack: 0.03, decay: 0.12, filter: { type: 'highpass', cutoff: 4000 } }), 0.2);
    return normalise(fadeEdges(master), 0.82);
  },
  /** New wave: a low horn announces the next surge. */
  'sfx-wave': () => {
    const master = new Float32Array(Math.round(1.15 * RATE));
    for (const [freq, gain] of [[110, 0.5], [165, 0.32], [220, 0.24], [330, 0.12]]) {
      mix(master, voice({ length: 1.15, wave: 'saw', f0: freq, f1: freq * 1.01, gain, attack: 0.09, decay: 0.5, filter: { type: 'lowpass', cutoff: 1500, cutoffEnd: 2600 } }));
    }
    mix(master, voice({ length: 0.8, wave: 'sine', f0: 55, f1: 55, gain: 0.5, attack: 0.06, decay: 0.4 }));
    return normalise(fadeEdges(master), 0.8);
  },
  /** Run over: the light dies, the drone falls away. */
  'sfx-death': () => {
    const master = new Float32Array(Math.round(1.5 * RATE));
    mix(master, voice({ length: 1.5, wave: 'saw', f0: 220, f1: 48, gain: 0.55, attack: 0.02, decay: 0.62, filter: { type: 'lowpass', cutoff: 1800, cutoffEnd: 220 } }));
    mix(master, voice({ length: 1.5, wave: 'sine', f0: 110, f1: 33, gain: 0.6, attack: 0.02, decay: 0.66 }));
    mix(master, voice({ length: 1.0, wave: 'triangle', f0: 440, f1: 90, gain: 0.2, attack: 0.05, decay: 0.4 }));
    mix(master, noise({ length: 0.7, gain: 0.3, attack: 0.01, decay: 0.28, filter: { type: 'lowpass', cutoff: 2600, cutoffEnd: 300 } }));
    return normalise(fadeEdges(master), 0.85);
  },
  /** Interface blip. */
  'sfx-ui': () => {
    const master = new Float32Array(Math.round(0.09 * RATE));
    mix(master, voice({ length: 0.09, wave: 'square', f0: 1180, f1: 1420, gain: 0.4, attack: 0.001, decay: 0.03, filter: { type: 'lowpass', cutoff: 4200 } }));
    mix(master, voice({ length: 0.09, wave: 'sine', f0: 2360, f1: 2480, gain: 0.16, attack: 0.001, decay: 0.025 }));
    return normalise(fadeEdges(master), 0.55);
  },
  /** Enemy bullet fired. */
  'sfx-enemy-shot': () => {
    const master = new Float32Array(Math.round(0.22 * RATE));
    mix(master, voice({ length: 0.22, wave: 'saw', f0: 520, f1: 180, gain: 0.42, attack: 0.002, decay: 0.06, filter: { type: 'lowpass', cutoff: 2600, cutoffEnd: 900 } }));
    mix(master, noise({ length: 0.14, gain: 0.3, attack: 0.002, decay: 0.04, filter: { type: 'bandpass', cutoff: 1500, q: 1.4 } }));
    return normalise(fadeEdges(master), 0.6);
  },
};

/**
 * The class cues share the renderer, while their layers describe different
 * materials: steel and weight, glassy magic, and a dry bowstring / leather.
 * Keep these below 350 ms so rapid combat remains legible over the BGM.
 */
const classActions = {
  'warrior-attack': { length: 0.24, peak: 0.78, layers: [
    { noise: true, length: 0.24, gain: 0.85, attack: 0.013, decay: 0.065, filter: { type: 'bandpass', cutoff: 550, cutoffEnd: 2700, q: 1.3 } },
    { wave: 'triangle', length: 0.16, f0: 470, f1: 135, gain: 0.32, attack: 0.003, decay: 0.045, filter: { cutoff: 1800 } },
    { wave: 'sine', length: 0.15, f0: 1320, f1: 1100, gain: 0.13, attack: 0.002, decay: 0.035, offset: 0.045 },
  ] },
  'warrior-dash': { length: 0.27, peak: 0.7, layers: [
    { noise: true, length: 0.27, gain: 0.72, attack: 0.018, decay: 0.08, filter: { type: 'bandpass', cutoff: 360, cutoffEnd: 1900, q: 1.1 } },
    { wave: 'sine', length: 0.14, f0: 180, f1: 65, gain: 0.7, attack: 0.004, decay: 0.045 },
    { noise: true, length: 0.12, gain: 0.3, attack: 0.002, decay: 0.027, filter: { type: 'bandpass', cutoff: 2300, q: 1 }, offset: 0.07 },
  ] },
  'warrior-guard': { length: 0.3, peak: 0.78, layers: [
    { wave: 'sine', length: 0.3, f0: 510, f1: 490, gain: 0.7, attack: 0.002, decay: 0.08 },
    { wave: 'sine', length: 0.27, f0: 790, f1: 775, gain: 0.4, attack: 0.002, decay: 0.06 },
    { wave: 'sine', length: 0.2, f0: 1230, f1: 1190, gain: 0.2, attack: 0.002, decay: 0.045 },
    { noise: true, length: 0.08, gain: 0.42, attack: 0.001, decay: 0.021, filter: { type: 'bandpass', cutoff: 2600, q: 1.1 } },
  ] },
  'mage-attack': { length: 0.28, peak: 0.73, layers: [
    { wave: 'sine', length: 0.25, f0: 1480, f1: 460, gain: 0.65, attack: 0.006, decay: 0.065 },
    { wave: 'triangle', length: 0.22, f0: 2220, f1: 920, gain: 0.18, attack: 0.005, decay: 0.055, filter: { cutoff: 3100 } },
    { wave: 'sine', length: 0.17, f0: 1760, f1: 1320, gain: 0.18, attack: 0.008, decay: 0.06, offset: 0.075 },
    { noise: true, length: 0.13, gain: 0.14, attack: 0.003, decay: 0.035, filter: { type: 'highpass', cutoff: 2800 } },
  ] },
  'mage-dash': { length: 0.32, peak: 0.68, layers: [
    { wave: 'sine', length: 0.27, f0: 470, f1: 1570, gain: 0.5, attack: 0.012, decay: 0.075 },
    { wave: 'sine', length: 0.25, f0: 940, f1: 2350, gain: 0.24, attack: 0.02, decay: 0.08, offset: 0.025 },
    { noise: true, length: 0.3, gain: 0.36, attack: 0.018, decay: 0.085, filter: { type: 'bandpass', cutoff: 1100, cutoffEnd: 3300, q: 1.2 } },
  ] },
  'mage-guard': { length: 0.32, peak: 0.74, layers: [
    { wave: 'sine', length: 0.32, f0: 880, f1: 900, gain: 0.5, attack: 0.004, decay: 0.105 },
    { wave: 'sine', length: 0.3, f0: 1320, f1: 1350, gain: 0.34, attack: 0.003, decay: 0.08 },
    { wave: 'sine', length: 0.25, f0: 2200, f1: 2230, gain: 0.16, attack: 0.003, decay: 0.065, offset: 0.025 },
    { noise: true, length: 0.12, gain: 0.18, attack: 0.004, decay: 0.025, filter: { type: 'highpass', cutoff: 3200 } },
  ] },
  'archer-attack': { length: 0.2, peak: 0.73, layers: [
    { wave: 'triangle', length: 0.19, f0: 390, f1: 170, gain: 0.65, attack: 0.001, decay: 0.038, filter: { cutoff: 2600 } },
    { wave: 'sine', length: 0.14, f0: 1170, f1: 620, gain: 0.22, attack: 0.001, decay: 0.027 },
    { noise: true, length: 0.16, gain: 0.55, attack: 0.005, decay: 0.04, filter: { type: 'bandpass', cutoff: 1900, cutoffEnd: 3600, q: 1.1 }, offset: 0.018 },
  ] },
  'archer-dash': { length: 0.23, peak: 0.67, layers: [
    { noise: true, length: 0.23, gain: 0.65, attack: 0.008, decay: 0.06, filter: { type: 'bandpass', cutoff: 1500, cutoffEnd: 3400, q: 1.1 } },
    { noise: true, length: 0.1, gain: 0.4, attack: 0.002, decay: 0.026, filter: { cutoff: 900 } },
    { wave: 'sine', length: 0.1, f0: 240, f1: 110, gain: 0.2, attack: 0.003, decay: 0.03 },
  ] },
  'archer-guard': { length: 0.23, peak: 0.75, layers: [
    { wave: 'triangle', length: 0.22, f0: 290, f1: 250, gain: 0.62, attack: 0.002, decay: 0.05, filter: { cutoff: 1800 } },
    { wave: 'sine', length: 0.16, f0: 730, f1: 690, gain: 0.25, attack: 0.002, decay: 0.038 },
    { noise: true, length: 0.09, gain: 0.45, attack: 0.001, decay: 0.021, filter: { type: 'bandpass', cutoff: 1400, q: 1.1 } },
    { noise: true, length: 0.12, gain: 0.18, attack: 0.003, decay: 0.03, filter: { type: 'highpass', cutoff: 2500 }, offset: 0.035 },
  ] },
};

for (const [name, { length, peak, layers }] of Object.entries(classActions)) {
  definitions[`sfx-${name}`] = () => {
    const master = new Float32Array(Math.round(length * RATE));
    for (const { noise: isNoise, offset = 0, ...options } of layers) {
      mix(master, isNoise ? noise(options) : voice(options), offset);
    }
    return normalise(fadeEdges(master), peak);
  };
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [name, render] of Object.entries(definitions)) {
  const samples = render();
  const wav = toWav(samples);
  writeFileSync(join(OUT_DIR, `${name}.wav`), wav);
  total += wav.length;
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB  ${(samples.length / RATE).toFixed(2)}s`);
}
console.log(`\n${Object.keys(definitions).length} effects, ${(total / 1024).toFixed(1)} KB total -> ${OUT_DIR}`);
