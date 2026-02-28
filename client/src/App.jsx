import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getUsers, login, register, getConversation, getMe, updateMe, deleteConversation, getAdminUsers, deleteConversationAsAdmin, deleteUser, setUserAdmin, getVapidPublic, subscribePush } from './api';
import { getSocketUrl } from './config';
import Login from './Login';
import ChatList from './ChatList';
import Conversation from './Conversation';
import AdminPanel from './AdminPanel';
import './App.css';

const AUTH_KEY = 'mini-telegram-auth';

function App() {
  const [auth, setAuth] = useState(null); // { user, token }
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [lastReadByOther, setLastReadByOther] = useState(0);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profileAbout, setProfileAbout] = useState('');
  const [pushStatus, setPushStatus] = useState(null); // null | 'enabled' | 'unsupported' | 'denied' | 'error'

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAuth(parsed);
        // Refresh user from server (e.g. is_admin)
        getMe().then((user) => {
          setAuth((prev) => (prev ? { ...prev, user } : null));
          setProfileAbout(user?.about ?? '');
        }).catch(() => {});
      } catch (_) {}
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    const socketUrl = getSocketUrl();
    const s = socketUrl ? io(socketUrl, { path: '/socket.io', transports: ['websocket', 'polling'] }) : io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    s.on('connect', () => s.emit('join', auth.token));
    s.on('online_users', (ids) => setOnlineUserIds(new Set(Array.isArray(ids) ? ids : [])));
    setSocket(s);
    return () => s.disconnect();
  }, [auth?.token]);

  useEffect(() => {
    if (!auth) return;
    getUsers()
      .then(setUsers)
      .catch((err) => {
        if (err.status === 401) setAuth(null);
        else setUsers([]);
      });
  }, [auth]);

  const loadConversation = useCallback(async (otherId) => {
    if (!auth) return;
    setSelectedUserId(otherId);
    try {
      const { messages: list, lastReadByOther: read } = await getConversation(otherId);
      setMessages(list);
      setLastReadByOther(read ?? 0);
      getUsers().then(setUsers).catch(() => {});
    } catch (err) {
      if (err.status === 401) setAuth(null);
      else setMessages([]);
    }
  }, [auth]);

  const handleLogin = useCallback(async (username, password) => {
    const { user, token } = await login(username, password);
    const full = await getMe().catch(() => user);
    setAuth({ user: full?.id ? full : user, token });
    setProfileAbout(full?.about ?? '');
  }, []);

  const handleRegister = useCallback(async (username, password, displayName) => {
    const { user, token } = await register(username, password, displayName);
    const full = await getMe().catch(() => user);
    setAuth({ user: full?.id ? full : user, token });
    setProfileAbout(full?.about ?? '');
  }, []);

  const handleLogout = useCallback(() => {
    setAuth(null);
    setSelectedUserId(null);
    setMessages([]);
    setPushStatus(null);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  const handleEnablePush = useCallback(async () => {
    if (!auth) return;
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        return;
      }
      const publicKey = await getVapidPublic();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      await subscribePush(sub.toJSON());
      setPushStatus('enabled');
    } catch (e) {
      setPushStatus('error');
      console.error('Push registration failed', e);
    }
  }, [auth]);

  const handleNewMessage = useCallback((msg) => {
    setMessages((prev) => {
      const fromMe = msg.sender_id === auth?.user?.id;
      if (fromMe) {
        const pendingIdx = prev.findIndex((m) => m.pending);
        if (pendingIdx >= 0) {
          const next = prev.slice();
          next[pendingIdx] = msg;
          next.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
          return next;
        }
      }
      const next = [...prev, msg];
      next.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      return next;
    });
  }, [auth?.user?.id]);

  const handleSendMessage = useCallback((content, replyToId, attachment) => {
    if (!socket || !selectedUserId || !auth?.user) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId,
      sender_id: auth.user.id,
      recipient_id: selectedUserId,
      content: content || '',
      created_at: Math.floor(Date.now() / 1000),
      reply_to_id: replyToId ?? null,
      edited_at: null,
      deleted_at: null,
      attachment_type: attachment?.type ?? null,
      attachment_url: attachment?.url ?? null,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    socket.emit('send_message', {
      recipientId: selectedUserId,
      content,
      replyToId: replyToId || undefined,
      attachmentUrl: attachment?.url,
      attachmentType: attachment?.type,
    });
  }, [socket, selectedUserId, auth?.user]);

  const handleMessageUpdated = useCallback((updated) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
  }, []);

  const handleMessageDeleted = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleMessageHidden = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleReadReceipt = useCallback(({ lastReadMessageId }) => {
    setLastReadByOther((prev) => Math.max(prev, lastReadMessageId));
  }, []);

  const handleProfileSave = useCallback(async (about) => {
    try {
      const user = await updateMe({ about });
      setAuth((prev) => (prev ? { ...prev, user } : null));
      setProfileAbout(user.about ?? '');
      setShowProfileEdit(false);
    } catch (e) {
      window.alert(e.message || 'Failed to update profile');
    }
  }, []);

  const handleDeleteChat = useCallback(async () => {
    if (!auth || !selectedUserId) return;
    if (!window.confirm('Delete all messages in this chat? This cannot be undone.')) return;
    try {
      await deleteConversation(selectedUserId);
      setMessages([]);
      setSelectedUserId(null);
    } catch (err) {
      window.alert(err.message || 'Failed to delete chat');
    }
  }, [auth, selectedUserId]);

  if (loading) {
    return (
      <div className="app app--loading">
        <span className="loader" />
      </div>
    );
  }

  if (!auth) {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  const { user } = auth;
  const otherUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className={`app ${showAdmin || selectedUserId ? 'app--main-open' : ''}`}>
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="logo">Mini Telegram</h1>
          <div className="sidebar-header-actions">
            {user?.is_admin && (
              <button type="button" className="btn-admin" onClick={() => setShowAdmin(!showAdmin)} title="Admin">
                Admin
              </button>
            )}
            <button type="button" className="btn-logout" onClick={handleLogout} title="Log out">
              Log out
            </button>
          </div>
        </header>
        <ChatList
          currentUser={user}
          users={users}
          selectedUserId={selectedUserId}
          onlineUserIds={onlineUserIds}
          onSelect={(id) => { setShowAdmin(false); loadConversation(id); }}
        />
        <div className="sidebar-profile" aria-label="Your profile">
          <span className="sidebar-profile-avatar">
            {(user?.display_name || user?.username || '?').charAt(0).toUpperCase()}
          </span>
          <div className="sidebar-profile-info">
            <span className="sidebar-profile-name">{user?.display_name || user?.username || '—'}</span>
            <span className="sidebar-profile-username">@{user?.username || '—'}</span>
            {user?.about ? <span className="sidebar-profile-about">{user.about}</span> : null}
            {user?.is_admin && <span className="sidebar-profile-badge">Admin</span>}
          </div>
          <button type="button" className="sidebar-profile-edit" onClick={() => { setProfileAbout(user?.about ?? ''); setShowProfileEdit(true); }} title="Edit profile">
            ✎
          </button>
        </div>
        {pushStatus !== 'enabled' && (
          <button type="button" className="sidebar-push-btn" onClick={handleEnablePush} title="Get notified of new messages">
            Enable notifications
          </button>
        )}
        {pushStatus === 'enabled' && <span className="sidebar-push-status">Notifications on</span>}
      </aside>
      {showProfileEdit && (
        <div className="profile-modal-overlay" onClick={() => setShowProfileEdit(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit profile</h3>
            <label>
              About
              <textarea value={profileAbout} onChange={(e) => setProfileAbout(e.target.value)} placeholder="Hey there, I am using Mini Telegram" rows={2} maxLength={150} />
            </label>
            <div className="profile-modal-actions">
              <button type="button" onClick={() => setShowProfileEdit(false)}>Cancel</button>
              <button type="button" onClick={() => handleProfileSave(profileAbout.trim())}>Save</button>
            </div>
          </div>
        </div>
      )}
      <main className="main">
        {showAdmin ? (
          <AdminPanel
            currentUser={user}
            onClose={() => setShowAdmin(false)}
            onUsersChange={() => getUsers().then(setUsers).catch(() => setUsers([]))}
          />
        ) : selectedUserId ? (
          <Conversation
            currentUser={user}
            otherUser={otherUser}
            messages={messages}
            lastReadByOther={lastReadByOther}
            onlineUserIds={onlineUserIds}
            onBack={() => setSelectedUserId(null)}
            onNewMessage={handleNewMessage}
            onSendMessage={handleSendMessage}
            onMessageUpdated={handleMessageUpdated}
            onMessageDeleted={handleMessageDeleted}
            onMessageHidden={handleMessageHidden}
            onReadReceipt={handleReadReceipt}
            onDeleteChat={handleDeleteChat}
            onDeleteChatAsAdmin={user?.is_admin ? () => {
              if (!window.confirm('Delete this entire conversation (admin)?')) return;
              deleteConversationAsAdmin(user.id, selectedUserId).then(() => {
                setMessages([]);
                setSelectedUserId(null);
              }).catch((e) => window.alert(e.message));
            } : null}
            socket={socket}
          />
        ) : (
          <div className="welcome">
            <p>Select a chat or start a conversation.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
