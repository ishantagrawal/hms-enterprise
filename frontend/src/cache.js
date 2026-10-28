// frontend/src/cache.js
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds cache validity

export function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.time < CACHE_TTL) {
    return item.data;
  }
  return null;
}

export function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
}

export function clearCache() {
  cache.clear();
}