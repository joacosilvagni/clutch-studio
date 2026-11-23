import { HttpError } from './http';

/**
 * Fixed-window counter in D1 (the native Rate Limiting binding is not confirmed on the free plan).
 * One upsert per request; returns 429 when the window count passes the limit.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number, nowMs: number): Promise<void> {
  const windowStart = Math.floor(nowMs / 1000 / windowSec) * windowSec;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, 'rate_limited', 'Too many requests, try again in a minute.');
}
