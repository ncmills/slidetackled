// Shared Redis client. Vercel's Upstash integration exposes KV_REST_API_URL + KV_REST_API_TOKEN
// (legacy names kept for backward compat with @vercel/kv). Upstash's `Redis.fromEnv()` only
// reads UPSTASH_REDIS_REST_*, so we wire the client up explicitly.

import { Redis } from '@upstash/redis';

export const kv = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});
