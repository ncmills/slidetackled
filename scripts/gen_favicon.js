#!/usr/bin/env node
// Build favicon.ico from public/brand/bubble.png (transparent PNG).
// Emits multi-size ICO (16, 32, 48, 64) so browsers pick the crispest.
// Uses macOS `sips` for downscale + Python's PIL as a fallback.

import { writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'public/brand/bubble.png');
const OUT = resolve(ROOT, 'public/favicon.ico');

if (!existsSync(SRC)) {
  console.error(`[gen_favicon] FATAL: ${SRC} missing. Run the brand keyer first.`);
  process.exit(1);
}

// Generate PNGs at each size using Python/PIL (preserves alpha and does decent downscale).
const sizes = [16, 32, 48, 64];
const tmp = mkdtempSync(join(tmpdir(), 'favicon-'));
const pngs = [];

for (const size of sizes) {
  const out = join(tmp, `icon-${size}.png`);
  execSync(`python3 -c "
from PIL import Image
im = Image.open('${SRC}').convert('RGBA')
# Pad to square first so the bubble isn't squished
w, h = im.size
side = max(w, h)
pad = Image.new('RGBA', (side, side), (0,0,0,0))
pad.paste(im, ((side-w)//2, (side-h)//2), im)
pad.resize((${size}, ${size}), Image.LANCZOS).save('${out}')
"`);
  pngs.push(readFileSync(out));
  console.log(`[gen_favicon] rendered ${size}x${size} (${pngs[pngs.length-1].length} bytes)`);
}

// ICO v6 with PNG-encoded frames (widely supported).
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
  e[2] = 0;
  e[3] = 0;
  e.writeUInt16LE(1, 4);    // color planes
  e.writeUInt16LE(32, 6);   // bpp
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  entries.push(e);
  offset += data.length;
}

const ico = Buffer.concat([header, ...entries, ...pngs]);
writeFileSync(OUT, ico);
console.log(`[gen_favicon] wrote ${OUT} (${ico.length} bytes, ${sizes.length} sizes)`);
