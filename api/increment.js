import { kv } from './_redis.js';
import { json, clientIp, rateLimit } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });

  const ip = clientIp(req);
  // Cap a single IP at 1,000 pours/hour to stop trivial spam.
  const ok = await rateLimit(kv, `slidetackled:rl:pour:${ip}:${hourBucket()}`, { limit: 1000, windowSec: 3600 });
  if (!ok) return json(res, 429, { error: 'too many pours' });

  const count = await kv.incr('slidetackled:pours');
  return json(res, 200, { count: Number(count) });
}

function hourBucket() {
  const d = new Date();
  return `${d.getUTCFullYear()}${d.getUTCMonth()}${d.getUTCDate()}${d.getUTCHours()}`;
}
