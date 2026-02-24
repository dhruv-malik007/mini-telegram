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

export async function getMe() {
  const res = await fetch(getApiUrl('/api/me'), { headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteConversation(otherId) {
  const res = await fetch(getApiUrl(`/api/conversation/${otherId}`), { method: 'DELETE', headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
}

// Admin
export async function getAdminUsers() {
  const res = await fetch(getApiUrl('/api/admin/users'), { headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (res.status === 403) throw new Error('Admin only');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteConversationAsAdmin(userId, otherId) {
  const res = await fetch(getApiUrl(`/api/admin/conversation?userId=${userId}&otherId=${otherId}`), { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

export async function deleteUser(id) {
  const res = await fetch(getApiUrl(`/api/admin/users/${id}`), { method: 'DELETE', headers: authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}

export async function setUserAdmin(id) {
  const res = await fetch(getApiUrl(`/api/admin/users/${id}/admin`), { method: 'POST', headers: authHeaders() });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
}
