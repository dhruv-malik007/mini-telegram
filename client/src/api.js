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

export async function getConversation(otherId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.beforeId != null) params.set('beforeId', opts.beforeId);
  const url = `/api/conversation/${otherId}` + (params.toString() ? `?${params}` : '');
  const res = await fetch(getApiUrl(url), { headers: authHeaders() });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return Array.isArray(data) ? { messages: data, lastReadByOther: 0 } : data;
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

export async function updateMe({ about, display_name }) {
  const res = await fetch(getApiUrl('/api/me'), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ about, display_name }),
  });
  if (res.status === 401) {
    const e = new Error('Unauthorized');
    e.status = 401;
    throw e;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function editMessage(id, content) {
  const res = await fetch(getApiUrl(`/api/messages/${id}`), {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteMessage(id) {
  const res = await fetch(getApiUrl(`/api/messages/${id}`), { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function hideMessage(id) {
  const res = await fetch(getApiUrl(`/api/messages/${id}/hide`), { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadMedia(file) {
  const token = getToken();
  if (!token) throw new Error('Unauthorized');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(getApiUrl('/api/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || res.statusText || 'Upload failed');
  }
  return res.json();
}

export async function getVapidPublic() {
  const res = await fetch(getApiUrl('/api/push/vapid-public'));
  if (!res.ok) throw new Error('Push not available');
  const data = await res.json();
  return data.publicKey;
}

export async function subscribePush(subscription) {
  const res = await fetch(getApiUrl('/api/push/subscribe'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error(await res.text());
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
