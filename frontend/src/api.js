import { extractErrorMessage } from './utils/errorParser.ts';

export const API_URL = import.meta.env.VITE_API_URL || 'https://api.svnitcampus.in';

const ALLOWED_API_ORIGINS = new Set([
  new URL(API_URL, window.location.origin).origin,
  'https://api.svnitcampus.in',
  'https://hms-enterprise-mqvx.onrender.com'
]);

export async function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const tenantDomain = localStorage.getItem('hms_tenant_domain');
  const credential = localStorage.getItem('hms_session_token')
    || sessionStorage.getItem('hms_session_token');
  const requestUrl = typeof input === 'string' ? input : input.url;
  const targetOrigin = new URL(requestUrl, window.location.origin).origin;

  if (tenantDomain) headers.set('X-Campus-Domain', tenantDomain);
  if (credential && ALLOWED_API_ORIGINS.has(targetOrigin)) {
    headers.set('Authorization', `Bearer ${credential}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && credential && ALLOWED_API_ORIGINS.has(targetOrigin)) {
    localStorage.removeItem('hms_session_token');
    localStorage.removeItem('hms_user');
    sessionStorage.removeItem('hms_session_token');
    sessionStorage.removeItem('hms_user');
    window.dispatchEvent(new Event('hms-auth-expired'));
  }
  if (!response.ok && response.headers.get('content-type')?.includes('application/json')) {
    const data = await response.clone().json().catch(() => null);
    if (data && typeof data === 'object' && !Array.isArray(data) && data.detail !== undefined) {
      data.detail = extractErrorMessage(data.detail, `Request failed (${response.status}).`);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('content-length');
      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }
  }
  return response;
}