#!/usr/bin/env node
// Rank archive entries by live vote score. Use to pick new capstone candidates.
//
// Usage:
//   node scripts/promote.js              # top 20 by net score
//   node scripts/promote.js --top 40     # top 40
//   node scripts/promote.js --min 3      # only entries with net score >= 3
//   node scripts/promote.js --all        # print every entry ranked
//
// Reads live votes from https://slidetackled.com/api/votes.
// Fetches text from the built public/toasts.json (run `npm run build` first).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITE = process.env.SLIDETACKLED_URL || 'https://slidetackled.com';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  if (i === -1) return fallback;
  return args[i + 1];
}
const TOP = Number(arg('top', 20));
const MIN = arg('min') !== undefined ? Number(arg('min')) : null;
const ALL = args.includes('--all');

const archivePath = resolve(ROOT, 'public/toasts.json');
if (!existsSync(archivePath)) {
  console.error('public/toasts.json missing. Run `npm run build` first.');
  process.exit(1);
}
const archive = JSON.parse(readFileSync(archivePath, 'utf8'));

const res = await fetch(`${SITE}/api/votes`, { cache: 'no-store' });
if (!res.ok) {
  console.error(`GET ${SITE}/api/votes → ${res.status}`);
  process.exit(1);
}
const data = await res.json();
const votes = (data && data.archive) || {};

const rows = archive.map((text, idx) => {
  const v = votes[idx] || { up: 0, down: 0 };
  const up = Number(v.up) || 0;
  const down = Number(v.down) || 0;
  return { idx, text, up, down, net: up - down, total: up + down };
});

rows.sort((a, b) => (b.net - a.net) || (b.total - a.total) || (a.idx - b.idx));

let out = rows;
if (!ALL) {
  if (MIN !== null) out = out.filter(r => r.net >= MIN);
  out = out.slice(0, TOP);
}

const pad = (s, n) => String(s).padStart(n);
console.log('ranked by net vote score (up − down), ties broken by total activity\n');
for (const r of out) {
  const first = r.text.split('\n')[0].slice(0, 80);
  console.log(`  #${pad(r.idx, 3)}  net ${pad(r.net, 3)}  (${r.up}↑ / ${r.down}↓)  ${first}`);
}
console.log(`\n${out.length} of ${rows.length} shown. site: ${SITE}`);
