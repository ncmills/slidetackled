#!/usr/bin/env node
// Smoke tests. Run after parser. Exits non-zero on failure.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');

let failures = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.log(`  FAIL ${msg}`);
    failures++;
  }
}

function loadJson(name) {
  const p = resolve(PUBLIC, name);
  if (!existsSync(p)) {
    console.log(`  FAIL ${name} missing — did you run 'npm run build'?`);
    failures++;
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    console.log(`  FAIL ${name} invalid JSON: ${err.message}`);
    failures++;
    return null;
  }
}

console.log('slidetackled smoke tests');
console.log('────────────────────────');

const archive = loadJson('toasts.json');
const config = loadJson('config.json');

assert(Array.isArray(archive), 'archive is an array');
assert(archive && archive.length >= 50, `archive.length >= 50 (got ${archive?.length})`);

function checkNoHeadersOrEmpties(arr, name) {
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];
    if (typeof t !== 'string' || t.trim().length === 0) {
      console.log(`  FAIL ${name}[${i}] is empty or not a string`);
      failures++;
      return;
    }
    if (t.includes('\n##') || /^##\s/.test(t) || /^-{3,}$/m.test(t)) {
      console.log(`  FAIL ${name}[${i}] contains header/divider markup: ${JSON.stringify(t.slice(0, 40))}`);
      failures++;
      return;
    }
  }
  console.log(`  ok   ${name} has no empty entries or stray markup`);
}
checkNoHeadersOrEmpties(archive, 'archive');

assert(config && typeof config === 'object', 'config.json parses');
assert(config && config.EASTER_EGGS && typeof config.EASTER_EGGS === 'object', 'config has EASTER_EGGS');

console.log('────────────────────────');
if (failures > 0) {
  console.log(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all tests passed');
