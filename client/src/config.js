/**
 * Server base URL for API and WebSocket.
 * Set VITE_API_URL when building for Android or production (e.g. https://your-server.com).
 * In dev, if unset we use http://localhost:3001 so API requests reach the Node server (avoids "Cannot POST" when proxy is unused).
 */
const DEFAULT_DEV_API = 'http://localhost:3001';

export function getApiBase() {
  const url = import.meta.env.VITE_API_URL;
  if (url && typeof url === 'string') {
    const base = url.replace(/\/$/, '').trim();
    if (base) {
      if (import.meta.env.PROD && base.startsWith('http://') && !/^http:\/\/localhost(\b|:)/.test(base) && !/^http:\/\/127\.0\.0\.1(\b|:)/.test(base)) {
        console.warn('Security: Use HTTPS for the API in production. Current URL uses HTTP.');
      }
      return base;
    }
  }
  if (import.meta.env.DEV) return DEFAULT_DEV_API;
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
