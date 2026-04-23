import { kv } from '@vercel/kv';
import { json, readBody } from './_util.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json(res, 405, { error: 'method not allowed' });
  }
  let firstToday = true;
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    firstToday = body && body.firstToday !== false;
  } catch { /* ignore body parse errors */ }

  // Increment visits only on first visit of the day (per client claim).
  // This is loose — clients can lie. For honest aggregate use /api/increment instead.
  const [visitor, pours] = await Promise.all([
    firstToday ? kv.incr('slidetackled:visits') : kv.get('slidetackled:visits'),
    kv.get('slidetackled:pours'),
  ]);

  return json(res, 200, {
    visitor: Number(visitor) || 0,
    pours: Number(pours) || 0,
  });
}
