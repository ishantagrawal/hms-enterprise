type ErrorLike = {
  message?: unknown;
  detail?: unknown;
  reason?: unknown;
  title?: unknown;
  response?: { data?: unknown; statusText?: unknown };
  data?: unknown;
};

function clean(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean).join('; ');
  }
  if (!value || typeof value !== 'object') return '';

  const item = value as ErrorLike;
  for (const key of ['detail', 'message', 'reason', 'title'] as const) {
    const text = clean(item[key]);
    if (text) return text;
  }
  return '';
}

export function extractErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  const item = err && typeof err === 'object' ? err as ErrorLike : null;
  const candidates = [
    item?.response?.data,
    item?.data,
    item?.detail,
    item?.message,
    err,
  ];
  for (const candidate of candidates) {
    const message = clean(candidate);
    if (message && message !== '[object Object]') return message;
  }
  return fallback;
}
