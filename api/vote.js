import { kv } from '@vercel/kv';
import { json, readBody, clientIp, rateLimit } from './_util.js';

const VALID_MODES = new Set(['archive', 'capstone', 'community']);
const VALID_DIRS = new Set(['up', 'down']);
const MAX_IDX = 5000;  // sanity cap

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

  let body;
  try { body = await readBody(req); } catch { return json(res, 400, { error: 'bad body' }); }

  const mode = String(body.mode || '');
  const idx = Number(body.idx);
  const dir = String(body.dir || '');

  if (!VALID_MODES.has(mode)) return json(res, 400, { error: 'bad mode' });
  if (!Number.isInteger(idx) || idx < 0 || idx > MAX_IDX) return json(res, 400, { error: 'bad idx' });
  if (!VALID_DIRS.has(dir)) return json(res, 400, { error: 'bad dir' });

  const ip = clientIp(req);
  const ok = await rateLimit(kv, `slidetackled:rl:vote:${ip}:${hourBucket()}`, { limit: 200, windowSec: 3600 });
  if (!ok) return json(res, 429, { error: 'too many votes' });

  // Server does NOT try to dedup by IP (toy site). Client-side localStorage is the only guard.
  // If the user votes twice, we count twice — fine.
  const voteKey = `slidetackled:v:${dir}:${mode}:${idx}`;
  const otherKey = `slidetackled:v:${dir === 'up' ? 'down' : 'up'}:${mode}:${idx}`;
  const idxSet = `slidetackled:voted-idx:${mode}`;

  const [newCount, otherCount] = await Promise.all([
    kv.incr(voteKey),
    kv.get(otherKey).then(v => Number(v) || 0),
    kv.sadd(idxSet, String(idx)),
  ]);

  return json(res, 200, {
    mode,
    idx,
    up: dir === 'up' ? Number(newCount) : otherCount,
    down: dir === 'down' ? Number(newCount) : otherCount,
  });
}

function hourBucket() {
  const d = new Date();
  return `${d.getUTCFullYear()}${d.getUTCMonth()}${d.getUTCDate()}${d.getUTCHours()}`;
}
