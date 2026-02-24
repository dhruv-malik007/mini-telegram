/**
 * Server base URL for API and WebSocket.
 * Set VITE_API_URL when building for Android or production (e.g. https://your-server.com).
 * Leave unset for web dev (same origin / Vite proxy).
 */
export function getApiBase() {
  const url = import.meta.env.VITE_API_URL;
  if (url && typeof url === 'string') {
    return url.replace(/\/$/, ''); // no trailing slash
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
