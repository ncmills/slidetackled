#!/usr/bin/env node
// Synthesize the full sound set for slidetackled. Writes WAVs, transcodes to MP3 via ffmpeg if available.
// Outputs:
//   public/audio/buzz.mp3   — short electric buzz on BUZZ button press
//   public/audio/vote.mp3   — soft ding on 👍 / 👎
//   public/audio/open.mp3   — two-tone "buddy signed on" chirp (played once per session if unmuted)
//   public/audio/clink.mp3  — legacy fallback (kept)

import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SR = 44100;

// ----------------------------- synths -------------------------------

function makeClink(duration = 0.32) {
  return synth(duration, (t) => {
    // wine-glass partials + decay
    const bend = 1 - 0.025 * t;
    let s = 0;
    const parts = [[1.0, 1.0], [1.625, 0.55], [2.57, 0.28], [3.9, 0.12]];
    for (const [r, a] of parts) s += Math.sin(2 * Math.PI * 2800 * r * bend * t) * a;
    const env = Math.exp(-t * 14);
    // attack transient
    const att = t < 0.0035 ? (Math.random() * 2 - 1) * 0.45 * Math.pow(1 - t / 0.0035, 2) : 0;
    return (att + s * env) * 0.28;
  });
}

function makeBuzz(duration = 0.22) {
  // Electric buzzer: square-ish wave at ~180Hz with amplitude modulation (classic door-buzzer vibe)
  return synth(duration, (t) => {
    const base = Math.sign(Math.sin(2 * Math.PI * 180 * t));                 // square
    const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 60 * t);                  // 60 Hz tremolo
    // envelope: fast attack, sustain, fast release
    let env;
    if (t < 0.01) env = t / 0.01;
    else if (t > duration - 0.04) env = (duration - t) / 0.04;
    else env = 1;
    return base * am * env * 0.18;
  });
}

function makeVote(duration = 0.18) {
  // Short two-step pixel ding
  return synth(duration, (t) => {
    const f = t < 0.05 ? 880 : 1320;  // step up after 50ms
    const s = Math.sin(2 * Math.PI * f * t);
    const env = Math.exp(-t * 18);
    return s * env * 0.22;
  });
}

function makeOpen(duration = 0.55) {
  // "Buddy signed on" two-tone chirp: low then high
  return synth(duration, (t) => {
    let f;
    if (t < 0.18) f = 520;
    else if (t < 0.22) f = 0;          // tiny gap
    else f = 780;
    if (f === 0) return 0;
    const s = Math.sin(2 * Math.PI * f * t);
    // envelope per tone
    let env = 0;
    if (t < 0.18) env = Math.min(1, t / 0.01) * Math.exp(-t * 6);
    else if (t >= 0.22) {
      const lt = t - 0.22;
      env = Math.min(1, lt / 0.01) * Math.exp(-lt * 6);
    }
    return s * env * 0.22;
  });
}

// ----------------------------- render + pack -------------------------

function synth(duration, fn) {
  const N = Math.floor(SR * duration);
  const buf = new Int16Array(N);
  let prev = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = fn(t);
    // gentle one-pole lowpass to soften hard edges
    v = 0.85 * v + 0.15 * prev;
    prev = v;
    buf[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  }
  return buf;
}

function makeWav(int16) {
  const dataSize = int16.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2);
  return buf;
}

function renderOne(name, samples) {
  const wavPath = resolve(ROOT, `public/audio/${name}.wav`);
  const mp3Path = resolve(ROOT, `public/audio/${name}.mp3`);
  writeFileSync(wavPath, makeWav(samples));
  console.log(`  wrote ${wavPath}`);
  try {
    execSync('command -v ffmpeg', { stdio: 'ignore' });
    execSync(`ffmpeg -y -loglevel error -i "${wavPath}" -codec:a libmp3lame -b:a 96k "${mp3Path}"`);
    console.log(`  wrote ${mp3Path} via ffmpeg`);
    try { unlinkSync(wavPath); } catch {}
  } catch {
    console.log(`  (no ffmpeg; shipping WAV for ${name})`);
  }
}

function makeClick(duration = 0.07) {
  // Short dry UI click — filtered noise burst with very fast decay.
  return synth(duration, (t) => {
    const env = Math.exp(-t * 80);
    const n = Math.random() * 2 - 1;
    const osc = Math.sin(2 * Math.PI * 1200 * t) * 0.3;
    return (n * 0.4 + osc) * env * 0.3;
  });
}

function makeWarn(duration = 0.45) {
  // 3-beep alarm: rising pitch, square-ish, high energy.
  return synth(duration, (t) => {
    const beepLen = 0.10;
    const gap = 0.05;
    const cycle = beepLen + gap;
    const n = Math.floor(t / cycle);
    const lt = t - n * cycle;
    if (lt > beepLen || n > 2) return 0;
    const freq = 880 + n * 220;   // 880, 1100, 1320
    const env = Math.min(1, lt / 0.005) * Math.exp(-lt * 4);
    return Math.sign(Math.sin(2 * Math.PI * freq * t)) * env * 0.16;
  });
}

function makeDoo(duration = 0.24) {
  // Classic AIM message "doo doo" — low-then-high two-tone.
  return synth(duration, (t) => {
    const f = t < 0.10 ? 620 : (t < 0.13 ? 0 : 880);
    if (f === 0) return 0;
    const phase = t < 0.10 ? t : (t - 0.13);
    const env = Math.min(1, phase / 0.005) * Math.exp(-phase * 10);
    return Math.sin(2 * Math.PI * f * t) * env * 0.22;
  });
}

renderOne('clink', makeClink());
renderOne('buzz',  makeBuzz());
renderOne('vote',  makeVote());
renderOne('open',  makeOpen());
renderOne('click', makeClick());
renderOne('warn',  makeWarn());
renderOne('doo',   makeDoo());
console.log('[gen_sounds] done');
