#!/usr/bin/env node
// Generate a 16x16 pixel-art cocktail glass favicon.ico (single size).
// Pure Node — no native deps. Writes public/favicon.ico.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Palette: 0 = transparent, 1 = ink, 2 = amber (drink), 3 = highlight
const INK = [26, 26, 26, 255];
const AMBER = [188, 140, 75, 255];
const HI = [245, 241, 232, 255];
const TRANSPARENT = [0, 0, 0, 0];
const palette = [TRANSPARENT, INK, AMBER, HI];

// 16x16 pixel-art martini/cocktail glass.
//  0 = transparent, 1 = ink outline, 2 = amber drink, 3 = highlight
const art = [
  '................',
  '..111111111111..',
  '..1............1',
  '..12222222222.1.',
  '...1222222221...',
  '....12222221....',
  '.....123221.....',
  '......121.......',
  '.......1........',
  '.......1........',
  '.......1........',
  '.......1........',
  '......111.......',
  '.....11.11......',
  '....111111111...',
  '.....11111......',
];

// Render into RGBA buffer
const SIZE = 16;
const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  const row = art[y] || '.'.repeat(SIZE);
  for (let x = 0; x < SIZE; x++) {
    const ch = row[x] || '.';
    let p;
    if (ch === '.') p = TRANSPARENT;
    else if (ch === '1') p = INK;
    else if (ch === '2') p = AMBER;
    else if (ch === '3') p = HI;
    else p = TRANSPARENT;
    const i = (y * SIZE + x) * 4;
    rgba[i] = p[0]; rgba[i + 1] = p[1]; rgba[i + 2] = p[2]; rgba[i + 3] = p[3];
  }
}

// Build a PNG from the RGBA buffer, then wrap it as an ICO file (ICO v6 supports PNG-encoded frames).
const png = buildPng(SIZE, SIZE, rgba);
const ico = buildIco(SIZE, SIZE, png);
writeFileSync(resolve(ROOT, 'public/favicon.ico'), ico);
console.log(`[gen_favicon] wrote public/favicon.ico (${ico.length} bytes)`);

// ---- PNG writer (minimal, Type 6 RGBA) -------------------------------------
function buildPng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT: rows prefixed with filter byte 0
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = zlib.deflateSync(raw);

  const chunks = [
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crc32(buf) {
  let c;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crc32.table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- ICO writer (single PNG-encoded frame) ---------------------------------
function buildIco(w, h, pngData) {
  // Header (6 bytes) + 1 entry (16 bytes) + PNG
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: 1 = ICO
  header.writeUInt16LE(1, 4);     // count: 1 image

  const entry = Buffer.alloc(16);
  entry[0] = w === 256 ? 0 : w;   // width, 0 means 256
  entry[1] = h === 256 ? 0 : h;
  entry[2] = 0;                   // color palette count
  entry[3] = 0;                   // reserved
  entry.writeUInt16LE(1, 4);      // color planes
  entry.writeUInt16LE(32, 6);     // bits per pixel
  entry.writeUInt32LE(pngData.length, 8);   // image size in bytes
  entry.writeUInt32LE(6 + 16, 12);          // offset to image data

  return Buffer.concat([header, entry, pngData]);
}
