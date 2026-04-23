#!/usr/bin/env node
// Generate a realistic glass-clink sound. Outputs WAV, then transcodes to MP3 via ffmpeg if available.
// Partials tuned to typical wine-glass resonances (~2.8k fundamental).

import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SAMPLE_RATE = 44100;
const DURATION = 0.32;
const N = Math.floor(SAMPLE_RATE * DURATION);

const FUND = 2800;                // wine-glass fundamental (Hz)
const PARTIAL_RATIOS = [1.0, 1.625, 2.57, 3.9];
const PARTIAL_AMPS   = [1.0, 0.55, 0.28, 0.12];

const samples = new Int16Array(N);
let prev = 0;
for (let i = 0; i < N; i++) {
  const t = i / SAMPLE_RATE;

  // Attack transient: short noise burst for the first ~3ms to sound like a strike.
  let attack = 0;
  if (t < 0.0035) {
    const a = 1 - t / 0.0035;
    attack = (Math.random() * 2 - 1) * 0.45 * a * a;
  }

  // Pitch droops slightly over the decay (damped glass).
  const bend = 1 - 0.025 * t;

  // Partials.
  let body = 0;
  for (let p = 0; p < PARTIAL_RATIOS.length; p++) {
    body += Math.sin(2 * Math.PI * FUND * PARTIAL_RATIOS[p] * bend * t) * PARTIAL_AMPS[p];
  }

  // Amplitude envelope: very fast onset, exponential decay.
  const env = Math.exp(-t * 14);
  let s = (attack + body * env) * 0.28;

  // Tiny 1-sample low-pass to take the hard edges off.
  s = 0.85 * s + 0.15 * prev;
  prev = s;

  samples[i] = Math.max(-32767, Math.min(32767, Math.round(s * 32767)));
}

const wav = makeWav(samples, SAMPLE_RATE);
const wavPath = resolve(ROOT, 'public/audio/clink.wav');
const mp3Path = resolve(ROOT, 'public/audio/clink.mp3');
writeFileSync(wavPath, wav);
console.log(`[gen_clink] wrote ${wavPath} (${wav.length} bytes)`);

// Transcode to MP3 if ffmpeg is on PATH. Fail soft otherwise.
try {
  execSync('command -v ffmpeg', { stdio: 'ignore' });
  execSync(`ffmpeg -y -loglevel error -i "${wavPath}" -codec:a libmp3lame -b:a 96k "${mp3Path}"`);
  console.log(`[gen_clink] wrote ${mp3Path} via ffmpeg`);
  // Remove WAV — MP3 is canonical now.
  try { unlinkSync(wavPath); } catch {}
} catch {
  console.log('[gen_clink] ffmpeg not found — shipping WAV only. Browsers play WAV fine.');
}

// ----------------------- helpers ------------------------
function makeWav(int16, rate) {
  const byteRate = rate * 2;
  const dataSize = int16.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < int16.length; i++) buf.writeInt16LE(int16[i], 44 + i * 2);
  return buf;
}
