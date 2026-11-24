// frontend/src/cache.js
const memoryCache = new Map();
const STORAGE_PREFIX = 'campus_os_cache_v3_';

function scopedKey(key) {
  const selectedDomain = localStorage.getItem('hms_tenant_domain');
  if (selectedDomain) return `${selectedDomain.toLowerCase()}_${key}`;

  try {
    const user = JSON.parse(localStorage.getItem('hms_user') || 'null');
    if (user?.college_id) return `${String(user.college_id).toLowerCase()}_${key}`;
  } catch (error) {
    console.error('Cache scope read error:', error);
  }

  return `${window.location.hostname.toLowerCase()}_${key}`;
}

export function getCached(key) {
  if (!key) return null;
  const cacheKey = scopedKey(key);
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache.set(cacheKey, parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }
  return null;
}

export function setCached(key, data) {
  if (!key) return;
  const cacheKey = scopedKey(key);
  memoryCache.set(cacheKey, data);
  try {
    localStorage.setItem(STORAGE_PREFIX + cacheKey, JSON.stringify(data));
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