// frontend/src/cache.js
const memoryCache = new Map();
const STORAGE_PREFIX = 'svnit_cache_v2_';

export function getCached(key) {
  if (!key) return null;
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }
  return null;
}

export function setCached(key, data) {
  if (!key) return;
  memoryCache.set(key, data);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

export function clearCache() {
  memoryCache.clear();
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(k);
      }
    });
  } catch (e) {
    console.error('Cache clear error:', e);
  }
}