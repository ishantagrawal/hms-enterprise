const API_URL = import.meta.env.VITE_API_URL || 'https://hms-enterprise-mqvx.onrender.com';

export async function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  const credential = localStorage.getItem('hms_google_credential');
  const requestUrl = typeof input === 'string' ? input : input.url;
  const targetOrigin = new URL(requestUrl, window.location.origin).origin;
  const apiOrigin = new URL(API_URL, window.location.origin).origin;

  if (credential && targetOrigin === apiOrigin) {
    headers.set('Authorization', `Bearer ${credential}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && credential && targetOrigin === apiOrigin) {
    localStorage.removeItem('hms_google_credential');
    localStorage.removeItem('hms_user');
    window.dispatchEvent(new Event('hms-auth-expired'));
  }
  return response;
}
