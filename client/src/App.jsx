import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getUsers, login, register, getConversation } from './api';
import { getSocketUrl } from './config';
import Login from './Login';
import ChatList from './ChatList';
import Conversation from './Conversation';
import './App.css';

const AUTH_KEY = 'mini-telegram-auth';

function App() {
  const [auth, setAuth] = useState(null); // { user, token }
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      try {
        setAuth(JSON.parse(stored));
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
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-header">
          <h1 className="logo">Mini Telegram</h1>
          <button type="button" className="btn-logout" onClick={handleLogout} title="Log out">
            Log out
          </button>
        </header>
        <ChatList
          currentUser={user}
          users={users}
          selectedUserId={selectedUserId}
          onSelect={loadConversation}
        />
      </aside>
      <main className="main">
        {selectedUserId ? (
          <Conversation
            currentUser={user}
            otherUser={otherUser}
            messages={messages}
            onNewMessage={handleNewMessage}
            onSendMessage={handleSendMessage}
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
