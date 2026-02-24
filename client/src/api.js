import { getApiUrl } from './config';

function getToken() {
  try {
    const data = localStorage.getItem('mini-telegram-auth');
    return data ? JSON.parse(data).token : null;
  } catch (_) {
    return null;
  }
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getUsers() {
  const res = await fetch(getApiUrl('/api/users'), { headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function register(username, password, displayName) {
  const res = await fetch(getApiUrl('/api/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: username.trim(),
      password,
      display_name: displayName?.trim() || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function login(username, password) {
  const res = await fetch(getApiUrl('/api/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export async function getConversation(otherId) {
  const res = await fetch(getApiUrl(`/api/conversation/${otherId}`), { headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
