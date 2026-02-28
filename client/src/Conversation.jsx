import { useState, useEffect, useRef, useCallback } from 'react';
import { editMessage, deleteMessage, hideMessage, uploadMedia } from './api';
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

/* Match both /reel/ID and /p/ID (posts) */
const INSTAGRAM_REEL_REGEX = /https?:\/\/(www\.)?instagram\.com\/(reel|p)\/([A-Za-z0-9_-]+)(\/?\S*)?/gi;

function parseContentWithReels(content) {
  if (!content || typeof content !== 'string') return [{ type: 'text', value: '' }];
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(INSTAGRAM_REEL_REGEX.source, 'gi');
  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const url = match[0];
    const kind = (match[2] || 'reel').toLowerCase(); /* 'reel' or 'p' */
    const reelId = match[3] || '';
    parts.push({ type: 'reel', value: url, reelId, isPost: kind === 'p' });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts.length ? parts : [{ type: 'text', value: content }];
}

function MessageAttachment({ type, url, isOutgoing }) {
  const label = type === 'video' ? 'Video' : 'Photo';
  return (
    <div className={`message-attachment message-attachment--${type || 'image'} ${isOutgoing ? 'message-attachment--outgoing' : ''}`}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="message-attachment-link">
        <span className="message-attachment-icon" aria-hidden>{type === 'video' ? '▶' : '🖼'}</span>
        <span className="message-attachment-label">{label}</span>
        <span className="message-attachment-hint">Open / Download</span>
      </a>
    </div>
  );
}

function ReelCard({ url, reelId, isOutgoing, onPlayInApp, isPost }) {
  const openInNewTab = (e) => {
    if (e?.metaKey || e?.ctrlKey) return;
    e?.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const handleClick = (e) => {
    if (onPlayInApp) onPlayInApp(url);
    else openInNewTab(e);
  };
  const label = isPost ? 'Instagram Post' : 'Instagram Reel';
  return (
    <div className={`message-reel-card ${isOutgoing ? 'message-reel-card--outgoing' : ''}`} role="presentation">
      <div
        className="message-reel-card-inner"
        onClick={handleClick}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        tabIndex={0}
        role="button"
        aria-label={`Open ${label}${reelId ? ` ${reelId}` : ''}`}
      >
        <span className="message-reel-card-icon" aria-hidden>▶</span>
        <div className="message-reel-card-text">
          <span className="message-reel-card-label">{label}</span>
          <span className="message-reel-card-hint">Tap to watch in app</span>
        </div>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="message-reel-card-external" onClick={(e) => e.stopPropagation()}>
        Open in new tab
      </a>
    </div>
  );
}

function ReelModal({ url, onClose }) {
  const containerRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = '';
    const blockquote = document.createElement('blockquote');
    blockquote.className = 'instagram-media';
    blockquote.setAttribute('data-instgrm-permalink', url.replace(/\/?$/, '/'));
    blockquote.setAttribute('data-instgrm-version', '14');
    el.appendChild(blockquote);

    if (window.instgrm) {
      window.instgrm.Embeds.process();
      return;
    }
    if (loadedRef.current) return;
    loadedRef.current = true;
    const script = document.createElement('script');
    script.async = true;
    script.src = '//www.instagram.com/embed.js';
    script.onload = () => { if (window.instgrm) window.instgrm.Embeds.process(); };
    document.body.appendChild(script);
    return () => { loadedRef.current = false; };
  }, [url]);

  return (
    <div className="reel-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Instagram Reel">
      <div className="reel-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="reel-modal-close" onClick={onClose} aria-label="Close">×</button>
        <p className="reel-modal-note">
          Instagram only allows a preview here. To watch the video, open it on Instagram.
        </p>
        <div className="reel-modal-embed" ref={containerRef} />
        <a href={url} target="_blank" rel="noopener noreferrer" className="reel-modal-open-tab">
          Open on Instagram
        </a>
      </div>
    </div>
  );
}

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
  const [reelViewUrl, setReelViewUrl] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
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

  // Mark as read when viewing this conversation (debounced)
  const markReadRef = useRef(null);
  useEffect(() => {
    if (!socket || !otherUser || !messages.length) return;
    const numericIds = messages.map((m) => m.id).filter((id) => typeof id === 'number');
    if (numericIds.length === 0) return;
    const maxId = Math.max(...numericIds);
    if (markReadRef.current) clearTimeout(markReadRef.current);
    markReadRef.current = setTimeout(() => {
      socket.emit('mark_read', { otherUserId: otherUser.id, lastReadMessageId: maxId });
      markReadRef.current = null;
    }, 400);
    return () => { if (markReadRef.current) clearTimeout(markReadRef.current); };
  }, [socket, otherUser?.id, messages.length]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text && !attachment) return;
    onSendMessage(text || '', replyingTo?.id, attachment || undefined);
    setInput('');
    setReplyingTo(null);
    setAttachment(null);
    setUploadError(null);
  };

  const handleFileChange = useCallback(async (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { url, type } = await uploadMedia(file);
      setAttachment({ url, type });
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

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
          const pending = !!msg.pending;
          const isRead = isOutgoing && !pending && typeof msg.id === 'number' && lastReadByOther >= msg.id;

          return (
            <div
              key={msg.id}
              className={`message ${isOutgoing ? 'message--outgoing' : 'message--incoming'} ${pending ? 'message--pending' : ''}`}
            >
              <div className="message-bubble-wrap">
                <div
                  className="message-bubble"
                  onContextMenu={(e) => {
                    if (pending) return;
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
                      <div className="message-content">
                        {msg.attachment_url && (
                          <MessageAttachment type={msg.attachment_type} url={msg.attachment_url} isOutgoing={isOutgoing} />
                        )}
                        {parseContentWithReels(msg.content).map((part, i) =>
                          part.type === 'text' ? (
                            <span key={i}>{part.value}</span>
                          ) : (
                            <ReelCard key={i} url={part.value} reelId={part.reelId} isOutgoing={isOutgoing} onPlayInApp={setReelViewUrl} isPost={part.isPost} />
                          )
                        )}
                      </div>
                      <span className="message-meta">
                        <span className="message-time">
                          {msg.created_at && new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.edited_at && <span className="message-edited"> (edited)</span>}
                          {pending && <span className="message-sending"> · Sending...</span>}
                        </span>
                        {isOutgoing && (
                          <span className="message-status" title={pending ? 'Sending' : isRead ? 'Read' : 'Sent'}>
                            {pending ? '○' : isRead ? '✓✓' : '✓'}
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

      {reelViewUrl && (
        <ReelModal url={reelViewUrl} onClose={() => setReelViewUrl(null)} />
      )}

      <form className="conversation-form" onSubmit={handleSubmit}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={handleFileChange}
          className="conversation-file-input"
          aria-label="Attach photo or video"
        />
        {attachment && (
          <div className="conversation-attachment-preview">
            <span className="conversation-attachment-preview-label">{attachment.type === 'video' ? 'Video' : 'Photo'} attached</span>
            <button type="button" className="conversation-attachment-preview-remove" onClick={() => { setAttachment(null); setUploadError(null); }} aria-label="Remove attachment">×</button>
          </div>
        )}
        {uploadError && <span className="conversation-upload-error">{uploadError}</span>}
        <div className="conversation-form-row">
          <button type="button" className="conversation-attach" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Attach file" title="Photo or video">
            {uploading ? '…' : '⊕'}
          </button>
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={handleInputChange}
            className="conversation-input"
            maxLength={10000}
          />
          <button type="submit" className="conversation-send" disabled={(!input.trim() && !attachment) || uploading} aria-label="Send">
            <span className="conversation-send-icon">↑</span>
          </button>
        </div>
      </form>
    </div>
  );
}
