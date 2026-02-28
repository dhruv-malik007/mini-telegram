/**
 * Server base URL for API and WebSocket.
 * Set VITE_API_URL when building for Android or production (e.g. https://your-server.com).
 * Leave unset for web dev (same origin / Vite proxy).
 * In production, only HTTPS should be used (except localhost).
 */
export function getApiBase() {
  const url = import.meta.env.VITE_API_URL;
  if (url && typeof url === 'string') {
    const base = url.replace(/\/$/, ''); // no trailing slash
    if (import.meta.env.PROD && base.startsWith('http://') && !/^http:\/\/localhost(\b|:)/.test(base) && !/^http:\/\/127\.0\.0\.1(\b|:)/.test(base)) {
      console.warn('Security: Use HTTPS for the API in production. Current URL uses HTTP.');
    }
    return base;
  }
  return '';
}

export function getApiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function getSocketUrl() {
  const base = getApiBase();
  return base || undefined; // undefined = same origin for io()
}
