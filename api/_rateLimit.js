// Simple in-memory sliding window rate limiter.
// State persists within a single Vercel function instance (resets on cold start).
// Provides meaningful protection against bursts without requiring an external store.

const windows = new Map();

module.exports = function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }

  entry.count++;
  windows.set(key, entry);

  // Prevent unbounded growth
  if (windows.size > 5000) {
    for (const [k, v] of windows) {
      if (now > v.resetAt) windows.delete(k);
    }
  }

  return entry.count <= maxRequests;
};
