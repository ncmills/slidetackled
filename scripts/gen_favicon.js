#!/usr/bin/env node
// Build multi-size favicon.ico.
//   - 16x16 is HAND-CRAFTED pixel-art (bubble silhouette, no text — "ST" is illegible at 16px)
//   - 32/48/64 are downsampled from public/brand/bubble.png via PIL
// 16px is the FIRST entry so browsers pick the sharp hand-crafted version for tab icons.

import { writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'public/brand/bubble.png');
const OUT = resolve(ROOT, 'public/favicon.ico');

// ---------------------- hand-crafted 16x16 bubble ----------------------
// Palette: . = transparent, 1 = black outline, Y = AIM yellow, b = black body
// 16x16 speech bubble with a downward-left tail.
const ART_16 = [
  '..11111111111...',
  '.1YYYYYYYYYY1...',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '1YYYYYYYYYYYY1..',
  '.1YYYY1YYYYY1...',
  '..1YY1YYYYY1....',
  '..1Y1YY11111....',
  '..111YY1........',
  '....11..........',
  '................',
];
const PAL = {
  '.': [0, 0, 0, 0],
  '1': [0, 0, 0, 255],
  'Y': [0xff, 0xdb, 0x4c, 255],
  'b': [0, 0, 0, 255],
};

function buildHandCrafted16() {
  const SIZE = 16;
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const row = ART_16[y] || '................';
    for (let x = 0; x < SIZE; x++) {
      const ch = row[x] || '.';
      const p = PAL[ch] || PAL['.'];
      const i = (y * SIZE + x) * 4;
      rgba[i] = p[0]; rgba[i + 1] = p[1]; rgba[i + 2] = p[2]; rgba[i + 3] = p[3];
    }
  }
  return encodePng(SIZE, SIZE, rgba);
}

// ---------------------- PNG writer (minimal) --------------------------
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // color type RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])) >>> 0, 0);
  return Buffer.concat([len, tb, data, crc]);
}
function crc32(buf) {
  if (!crc32.t) { crc32.t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); crc32.t[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crc32.t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------- downsample larger sizes via PIL ---------------
function buildDownsampled(size) {
  const tmp = mkdtempSync(join(tmpdir(), 'favicon-'));
  const out = join(tmp, `icon-${size}.png`);
  execSync(`python3 -c "
from PIL import Image
im = Image.open('${SRC}').convert('RGBA')
w, h = im.size
side = max(w, h)
pad = Image.new('RGBA', (side, side), (0,0,0,0))
pad.paste(im, ((side-w)//2, (side-h)//2), im)
pad.resize((${size}, ${size}), Image.LANCZOS).save('${out}')
"`);
  return readFileSync(out);
}

// ---------------------- assemble ICO ----------------------------------
if (!existsSync(SRC)) {
  console.error(`[gen_favicon] FATAL: ${SRC} missing.`);
  process.exit(1);
}

const sizes = [16, 32, 48, 64];
const pngs = [];
for (const size of sizes) {
  if (size === 16) {
    pngs.push(buildHandCrafted16());
    console.log(`[gen_favicon] 16x16 hand-crafted (${pngs[pngs.length-1].length} bytes)`);
  } else {
    pngs.push(buildDownsampled(size));
    console.log(`[gen_favicon] ${size}x${size} downsampled (${pngs[pngs.length-1].length} bytes)`);
  }
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);

const entries = [];
const entriesLen = 16 * sizes.length;
let offset = 6 + entriesLen;
for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i];
  const data = pngs[i];
  const e = Buffer.alloc(16);
  e[0] = size === 256 ? 0 : size;
  e[1] = size === 256 ? 0 : size;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += data.length;
}

writeFileSync(OUT, Buffer.concat([header, ...entries, ...pngs]));
console.log(`[gen_favicon] wrote ${OUT} (${sizes.length} sizes)`);
