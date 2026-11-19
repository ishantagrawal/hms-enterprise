export const API_URL = import.meta.env.VITE_API_URL || 'https://api.svnitcampus.in';

export function unwrapApiError(payload, fallback = 'Request failed') {
  if (typeof payload === 'string') return payload.trim() || fallback;
  if (!payload || typeof payload !== 'object') return fallback;
  if (typeof payload.detail === 'string') return payload.detail;
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      const location = Array.isArray(item.loc) ? ` (${item.loc.join('.')})` : '';
      return `${item.msg || item.message || 'Invalid request'}${location}`;
    }).join('; ');
  }
  if (payload.detail && typeof payload.detail === 'object') {
    return unwrapApiError(payload.detail, fallback);
  }
  return fallback;
}

export function extractErrorMessage(err, fallback = 'Request failed') {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err.trim() || fallback;
  if (!err || typeof err !== 'object') return fallback;
  return unwrapApiError(err, fallback);
}

const ALLOWED_API_ORIGINS = new Set([
  new URL(API_URL, window.location.origin).origin,
  'https://api.svnitcampus.in',
  'https://hms-enterprise-mqvx.onrender.com'
]);

export async function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const credential = localStorage.getItem('hms_session_token')
    || localStorage.getItem('hms_google_credential');
  const requestUrl = typeof input === 'string' ? input : input.url;
  const targetOrigin = new URL(requestUrl, window.location.origin).origin;

  if (credential && ALLOWED_API_ORIGINS.has(targetOrigin)) {
    headers.set('Authorization', `Bearer ${credential}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && credential && ALLOWED_API_ORIGINS.has(targetOrigin)) {
    localStorage.removeItem('hms_session_token');
    localStorage.removeItem('hms_google_credential');
    localStorage.removeItem('hms_user');
    window.dispatchEvent(new Event('hms-auth-expired'));
  }
  return response;
}