import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getUsers, login, register, getConversation, getMe, deleteConversation, getAdminUsers, deleteConversationAsAdmin, deleteUser, setUserAdmin } from './api';
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

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setAuth(parsed);
        // Refresh user from server (e.g. is_admin)
        getMe().then((user) => {
          setAuth((prev) => (prev ? { ...prev, user } : null));
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
      const list = await getConversation(otherId);
      setMessages(list);
    } catch (err) {
      if (err.status === 401) setAuth(null);
      else setMessages([]);
    }
  }, [auth]);

  const handleLogin = useCallback(async (username, password) => {
    const { user, token } = await login(username, password);
    setAuth({ user, token });
  }, []);

  const handleRegister = useCallback(async (username, password, displayName) => {
    const { user, token } = await register(username, password, displayName);
    setAuth({ user, token });
  }, []);

  const handleLogout = useCallback(() => {
    setAuth(null);
    setSelectedUserId(null);
    setMessages([]);
    localStorage.removeItem(AUTH_KEY);
  }, []);

  const handleNewMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleSendMessage = useCallback((content) => {
    if (!socket || !selectedUserId) return;
    socket.emit('send_message', { recipientId: selectedUserId, content });
  }, [socket, selectedUserId]);

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
            {user?.is_admin && <span className="sidebar-profile-badge">Admin</span>}
          </div>
        </div>
      </aside>
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
            onlineUserIds={onlineUserIds}
            onBack={() => setSelectedUserId(null)}
            onNewMessage={handleNewMessage}
            onSendMessage={handleSendMessage}
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
