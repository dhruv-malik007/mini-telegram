import './ChatList.css';

export default function ChatList({ currentUser, users, selectedUserId, onSelect }) {
  const others = users.filter((u) => u.id !== currentUser.id);

  return (
    <nav className="chat-list">
      <ul className="chat-list-ul">
        {others.length === 0 ? (
          <li className="chat-list-empty">No other users yet. Open another browser or incognito to add another account and chat.</li>
        ) : (
          others.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={`chat-list-item ${selectedUserId === u.id ? 'chat-list-item--active' : ''}`}
                onClick={() => onSelect(u.id)}
              >
                <span className="chat-list-avatar">{ (u.display_name || u.username).charAt(0).toUpperCase() }</span>
                <div className="chat-list-info">
                  <span className="chat-list-name">{ u.display_name || u.username }</span>
                  <span className="chat-list-username">@{ u.username }</span>
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </nav>
  );
}
