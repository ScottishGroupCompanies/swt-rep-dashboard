const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 8;
const hits = new Map();

function recent(key, now) {
  return (hits.get(key) || []).filter((time) => now - time < WINDOW_MS);
}

export function resetRateLimit() {
  hits.clear();
}

export function isLimited(key, now = Date.now()) {
  return recent(key, now).length >= LIMIT;
}

export function recordFailure(key, now = Date.now()) {
  const rows = recent(key, now);
  rows.push(now);
  hits.set(key, rows);
}

export function clearFailures(key) {
  hits.delete(key);
}
