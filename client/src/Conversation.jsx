import { useState, useEffect, useRef } from 'react';
import './Conversation.css';

export default function Conversation({
  currentUser,
  otherUser,
  messages,
  onNewMessage,
  onSendMessage,
  onDeleteChat,
  onDeleteChatAsAdmin,
  socket,
}) {
  const [input, setInput] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!socket || !otherUser) return;
    const handler = (msg) => {
      const isThisChat =
        (msg.sender_id === currentUser.id && msg.recipient_id === otherUser.id) ||
        (msg.sender_id === otherUser.id && msg.recipient_id === currentUser.id);
      if (isThisChat) onNewMessage(msg);
    };
    socket.on('new_message', handler);
    return () => socket.off('new_message', handler);
  }, [socket, currentUser?.id, otherUser?.id, onNewMessage]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
  };

  if (!otherUser) return null;

  return (
    <>
      <header className="conversation-header">
        <span className="conversation-avatar">
          {(otherUser.display_name || otherUser.username).charAt(0).toUpperCase()}
        </span>
        <div className="conversation-header-info">
          <span className="conversation-name">{otherUser.display_name || otherUser.username}</span>
          <span className="conversation-username">@{otherUser.username}</span>
        </div>
        <div className="conversation-header-actions">
          {onDeleteChat && (
            <button type="button" className="btn-delete-chat" onClick={onDeleteChat} title="Delete chat">
              Delete chat
            </button>
          )}
          {onDeleteChatAsAdmin && (
            <button type="button" className="btn-delete-chat admin" onClick={onDeleteChatAsAdmin} title="Delete conversation (admin)">
              Delete (admin)
            </button>
          )}
        </div>
      </header>

      <div className="conversation-messages" ref={listRef}>
        {messages.map((msg) => {
          const isOutgoing = msg.sender_id === currentUser.id;
          return (
            <div
              key={msg.id}
              className={`message ${isOutgoing ? 'message--outgoing' : 'message--incoming'}`}
            >
              <div className="message-bubble">
                <span className="message-content">{msg.content}</span>
                <span className="message-time">
                  {new Date(msg.created_at * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form className="conversation-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="conversation-input"
          maxLength={10000}
        />
        <button type="submit" className="conversation-send" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </>
  );
}
