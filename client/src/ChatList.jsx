import { useState, useMemo } from 'react';
import './ChatList.css';

export default function ChatList({ currentUser, users, selectedUserId, onlineUserIds, onSelect }) {
  const [search, setSearch] = useState('');
  const others = useMemo(() => users.filter((u) => u.id !== currentUser.id), [users, currentUser.id]);
  const onlineSet = onlineUserIds || new Set();

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return others;
    return others.filter((u) => {
      const un = (u.username || '').toLowerCase();
      const dn = (u.display_name || u.username || '').toLowerCase();
      return un.includes(q) || dn.includes(q);
    });
  }, [others, search]);

  return (
    <nav className="chat-list">
      <div className="chat-list-search-wrap">
        <input
          type="search"
          placeholder="Search usernames..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="chat-list-search"
          aria-label="Search users"
        />
      </div>
      <ul className="chat-list-ul">
        {others.length === 0 ? (
          <li className="chat-list-empty">No other users yet. Open another browser or incognito to add another account and chat.</li>
        ) : filtered.length === 0 ? (
          <li className="chat-list-empty">No users match &quot;{search.trim()}&quot;</li>
        ) : (
          filtered.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={`chat-list-item ${selectedUserId === u.id ? 'chat-list-item--active' : ''}`}
                onClick={() => onSelect(u.id)}
              >
                <span className="chat-list-avatar-wrap">
                  <span className="chat-list-avatar">{ (u.display_name || u.username).charAt(0).toUpperCase() }</span>
                  {onlineSet.has(u.id) && <span className="chat-list-online" title="Online" />}
                </span>
                <div className="chat-list-info">
                  <span className="chat-list-name">{ u.display_name || u.username }</span>
                  <span className="chat-list-username">@{ u.username }{ onlineSet.has(u.id) ? ' · Online' : '' }</span>
                  <span className="chat-list-username-mobile">@{ u.username }{ onlineSet.has(u.id) ? ' · Online' : '' }</span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}
