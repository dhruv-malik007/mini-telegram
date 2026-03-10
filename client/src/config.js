/**
 * Server base URL for API and WebSocket.
 * Set VITE_API_URL when building for Android or when frontend is on a different domain than the API.
 * In dev, if unset we use http://localhost:3001.
 * In production on Render (same origin), if unset we use window.location.origin so the phone and laptop both hit the same URL.
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
  // Production, same-origin (e.g. Render): use current page origin so API works from phone and laptop
  if (import.meta.env.PROD && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
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
