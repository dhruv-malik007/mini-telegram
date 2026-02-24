import { useState, useEffect, useRef, useCallback } from 'react';
import './Conversation.css';

export default function Conversation({
  currentUser,
  otherUser,
  messages,
  onlineUserIds,
  onBack,
  onNewMessage,
  onSendMessage,
  onDeleteChat,
  onDeleteChatAsAdmin,
  socket,
}) {
  const [input, setInput] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const listRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const emitTypingRef = useRef(null);

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
    if (!socket || !otherUser) return;
    const handler = ({ userId }) => {
      if (userId !== otherUser.id) return;
      setOtherTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setOtherTyping(false);
        typingTimeoutRef.current = null;
      }, 3000);
    };
    socket.on('user_typing', handler);
    return () => {
      socket.off('user_typing', handler);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [socket, otherUser?.id]);

  const emitTyping = useCallback(() => {
    if (!socket || !otherUser) return;
    if (emitTypingRef.current) return;
    socket.emit('typing', { recipientId: otherUser.id });
    emitTypingRef.current = setTimeout(() => { emitTypingRef.current = null; }, 1000);
  }, [socket, otherUser?.id]);

  useEffect(() => {
    return () => {
      if (emitTypingRef.current) clearTimeout(emitTypingRef.current);
    };
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
  };

  if (!otherUser) return null;

  return (
    <div className="conversation">
      <header className="conversation-header">
        {onBack && (
          <button type="button" className="conversation-back" onClick={onBack} aria-label="Back to chats">
            <span className="conversation-back-icon" aria-hidden>←</span>
          </button>
        )}
        <span className="conversation-avatar">
          {(otherUser.display_name || otherUser.username).charAt(0).toUpperCase()}
        </span>
        <div className="conversation-header-info">
          <span className="conversation-name">{(otherUser.display_name || otherUser.username)}</span>
          <span className="conversation-username conversation-username-desktop">
            @{otherUser.username}
            {onlineUserIds && onlineUserIds.has(otherUser.id) && <span className="conversation-online"> · Online</span>}
          </span>
          <span className="conversation-username-mobile">@{otherUser.username}{onlineUserIds && onlineUserIds.has(otherUser.id) ? ' · Online' : ''}</span>
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
        {otherTyping && (
          <div className="conversation-typing">
            <span className="conversation-typing-dots" />
            <span className="conversation-typing-text">{(otherUser.display_name || otherUser.username)} is typing...</span>
          </div>
        )}
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
          onChange={handleInputChange}
          className="conversation-input"
          maxLength={10000}
        />
        <button type="submit" className="conversation-send" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
