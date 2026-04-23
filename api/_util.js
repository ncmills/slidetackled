// Small helpers shared across API functions.

import crypto from 'node:crypto';

export function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 50_000) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function safeEqual(a, b) {
  try {
    const ab = Buffer.from(a); const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch { return false; }
}

/**
 * Rate limit: returns true if within budget, false if over.
 * Uses Vercel KV INCR + EXPIRE on first hit. Windowed by minute bucket.
 */
export async function rateLimit(kv, key, { limit, windowSec }) {
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, windowSec);
  return n <= limit;
}
