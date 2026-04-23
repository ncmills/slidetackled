#!/usr/bin/env node
// Reads toasts.md, capstone.md, community.md. Writes 3 JSONs to public/.
// Also copies config.js -> public/config.json so the browser can read flags.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');

/**
 * Parse a markdown file containing numbered entries.
 * - Lines matching ^(\d+)\.\s+ start a new entry.
 * - Subsequent non-numbered, non-header lines belong to the current entry (preserves line breaks).
 * - Lines starting with `#` or matching `^---+$` are treated as structural and skipped.
 * - Blank lines end the current entry continuation only if the next content is a new number or header.
 */
function parseMarkdown(src) {
  const entries = [];
  let current = null;

  const lines = src.replace(/\r\n/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;
    const trimmed = line.trim();

    // Structural lines — skip.
    if (/^#+\s/.test(trimmed)) { flush(); continue; }
    if (/^-{3,}$/.test(trimmed)) { flush(); continue; }

    // New numbered entry.
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m) {
      flush();
      current = m[2];
      continue;
    }

    // Continuation line.
    if (current !== null) {
      if (trimmed === '') {
        // Look ahead: if the next non-blank line is a new number or header, flush now.
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') j++;
        if (j < lines.length) {
          const next = lines[j].trim();
          if (/^\d+\.\s+/.test(next) || /^#+\s/.test(next) || /^-{3,}$/.test(next)) {
            flush();
          }
        } else {
          flush();
        }
        continue;
      }
      // Append with a newline to preserve intentional breaks.
      current += '\n' + line.replace(/^\s{0,4}/, '');
      continue;
    }
    // Pre-first-entry narrative — ignored.
  }
  flush();

  function flush() {
    if (current !== null) {
      // Trim leading/trailing whitespace but preserve intentional line breaks inside.
      const cleaned = current.replace(/^[\s\n]+|[\s\n]+$/g, '');
      if (cleaned.length > 0) entries.push(cleaned);
    }
    current = null;
  }

  return entries;
}

function parseFile(filename, { required }) {
  const path = resolve(ROOT, filename);
  if (!existsSync(path)) {
    if (required) {
      console.error(`[parse_toasts] FATAL: required file missing: ${filename}`);
      process.exit(1);
    }
    return [];
  }
  const src = readFileSync(path, 'utf8');
  const entries = parseMarkdown(src);
  return entries;
}

function writeJson(name, data) {
  const path = resolve(PUBLIC, name);
  writeFileSync(path, JSON.stringify(data, null, 0) + '\n', 'utf8');
  console.log(`[parse_toasts] wrote ${name} (${data.length} entries)`);
}

function main() {
  const archive = parseFile('toasts.md', { required: true });

  writeJson('toasts.json', archive);

  // Emit config as JSON for the browser.
  writeFileSync(
    resolve(PUBLIC, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  );
  console.log('[parse_toasts] wrote config.json');
}

main();
