import { useState, useEffect, useRef, useCallback } from 'react';
import { editMessage, deleteMessage, hideMessage } from './api';
import './Conversation.css';

function formatDateKey(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

function formatLastSeen(ts) {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'last seen just now';
  if (diff < 3600) return `last seen ${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `last seen at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `last seen ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const EDIT_WINDOW_SEC = 15 * 60;

export default function Conversation({
  currentUser,
  otherUser,
  messages,
  lastReadByOther,
  onlineUserIds,
  onBack,
  onNewMessage,
  onSendMessage,
  onMessageUpdated,
  onMessageDeleted,
  onMessageHidden,
  onReadReceipt,
  onDeleteChat,
  onDeleteChatAsAdmin,
  socket,
}) {
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
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
    socket.on('message_updated', (updated) => {
      if ((updated.sender_id === otherUser.id && updated.recipient_id === currentUser.id) || (updated.sender_id === currentUser.id && updated.recipient_id === otherUser.id)) {
        onMessageUpdated?.(updated);
      }
    });
    socket.on('message_deleted', ({ id }) => onMessageDeleted?.(id));
    socket.on('read_receipt', ({ userId, lastReadMessageId }) => {
      if (userId === otherUser.id) onReadReceipt?.({ lastReadMessageId });
    });
    return () => {
      socket.off('message_updated');
      socket.off('message_deleted');
      socket.off('read_receipt');
    };
  }, [socket, otherUser?.id, onMessageUpdated, onMessageDeleted, onReadReceipt]);

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

  // Mark as read when viewing this conversation (send latest message id)
  useEffect(() => {
    if (!socket || !otherUser || !messages.length) return;
    const maxId = Math.max(...messages.map((m) => m.id));
    socket.emit('mark_read', { otherUserId: otherUser.id, lastReadMessageId: maxId });
  }, [socket, otherUser?.id, messages.length]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSendMessage(text, replyingTo?.id);
    setInput('');
    setReplyingTo(null);
  };

  const getReplyMessage = (replyToId) => messages.find((m) => m.id === replyToId);

  const handleEdit = (msg) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
    setMenuMessageId(null);
  };

  const handleSaveEdit = async () => {
    if (editingId == null || !editContent.trim()) {
      setEditingId(null);
      return;
    }
    try {
      const updated = await editMessage(editingId, editContent.trim());
      onMessageUpdated?.(updated);
      setEditingId(null);
    } catch (e) {
      window.alert(e.message || 'Failed to edit');
    }
  };

  const handleDeleteForMe = async (id) => {
    setMenuMessageId(null);
    try {
      await hideMessage(id);
      onMessageHidden?.(id);
    } catch (e) {
      window.alert(e.message || 'Failed to delete');
    }
  };

  const handleDeleteForEveryone = async (id) => {
    setMenuMessageId(null);
    if (!window.confirm('Delete for everyone? This cannot be undone.')) return;
    try {
      await deleteMessage(id);
      onMessageDeleted?.(id);
    } catch (e) {
      window.alert(e.message || 'Failed to delete');
    }
  };

  const canEdit = (msg) =>
    msg.sender_id === currentUser.id && msg.created_at && (Date.now() / 1000 - msg.created_at) < EDIT_WINDOW_SEC;

  if (!otherUser) return null;

  let lastDateKey = null;
  const rows = [];
  for (const msg of messages) {
    const dateKey = formatDateKey(msg.created_at);
    if (dateKey !== lastDateKey) {
      lastDateKey = dateKey;
      rows.push({ type: 'date', key: `date-${msg.id}-${dateKey}`, label: dateKey });
    }
    rows.push({ type: 'message', key: msg.id, message: msg });
  }

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
            {onlineUserIds && onlineUserIds.has(otherUser.id) ? (
              <span className="conversation-online"> · Online</span>
            ) : (
              otherUser.last_seen_at && (
                <span className="conversation-last-seen"> · {formatLastSeen(otherUser.last_seen_at)}</span>
              )
            )}
          </span>
          <span className="conversation-username-mobile">
            @{otherUser.username}
            {onlineUserIds && onlineUserIds.has(otherUser.id) ? ' · Online' : otherUser.last_seen_at ? ` · ${formatLastSeen(otherUser.last_seen_at)}` : ''}
          </span>
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
        {rows.map((row) => {
          if (row.type === 'date') {
            return (
              <div key={row.key} className="message-date-sep">
                {row.label}
              </div>
            );
          }
          const msg = row.message;
          const isOutgoing = msg.sender_id === currentUser.id;
          const replyTo = msg.reply_to_id ? getReplyMessage(msg.reply_to_id) : null;
          const isRead = isOutgoing && lastReadByOther >= msg.id;

          return (
            <div
              key={msg.id}
              className={`message ${isOutgoing ? 'message--outgoing' : 'message--incoming'}`}
            >
              <div className="message-bubble-wrap">
                <div
                  className="message-bubble"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuMessageId(menuMessageId === msg.id ? null : msg.id);
                  }}
                >
                  {replyTo && (
                    <div className="message-reply-preview">
                      <span className="message-reply-name">{replyTo.sender_id === currentUser.id ? 'You' : (otherUser.display_name || otherUser.username)}</span>
                      <span className="message-reply-text">{replyTo.content?.slice(0, 80)}{(replyTo.content?.length || 0) > 80 ? '…' : ''}</span>
                    </div>
                  )}
                  {editingId === msg.id ? (
                    <div className="message-edit-inline">
                      <input
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); } if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <button type="button" onClick={handleSaveEdit}>Save</button>
                      <button type="button" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span className="message-content">{msg.content}</span>
                      <span className="message-meta">
                        <span className="message-time">
                          {msg.created_at && new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.edited_at && <span className="message-edited"> (edited)</span>}
                        </span>
                        {isOutgoing && (
                          <span className="message-status" title={isRead ? 'Read' : 'Sent'}>
                            {isRead ? '✓✓' : '✓'}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
                {menuMessageId === msg.id && (
                  <div className="message-menu">
                    <button type="button" onClick={() => { setReplyingTo(msg); setMenuMessageId(null); }}>Reply</button>
                    {canEdit(msg) && (
                      <button type="button" onClick={() => handleEdit(msg)}>Edit</button>
                    )}
                    <button type="button" onClick={() => handleDeleteForMe(msg.id)}>Delete for me</button>
                    {msg.sender_id === currentUser.id && (
                      <button type="button" onClick={() => handleDeleteForEveryone(msg.id)}>Delete for everyone</button>
                    )}
                    <button type="button" onClick={() => setMenuMessageId(null)}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {replyingTo && (
        <div className="conversation-reply-bar">
          <span className="conversation-reply-preview">Replying to {(replyingTo.sender_id === currentUser.id ? 'yourself' : (otherUser.display_name || otherUser.username))}: {replyingTo.content?.slice(0, 40)}…</span>
          <button type="button" className="conversation-reply-cancel" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">×</button>
        </div>
      )}

      <form className="conversation-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={handleInputChange}
          className="conversation-input"
          maxLength={10000}
        />
        <button type="submit" className="conversation-send" disabled={!input.trim()} aria-label="Send">
          <span className="conversation-send-icon">↑</span>
        </button>
      </form>
    </div>
  );
}
