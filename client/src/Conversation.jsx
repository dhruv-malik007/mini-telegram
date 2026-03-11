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

function getMediaErrorMessage(err, forVideo = false) {
  const name = err?.name;
  const msg = err?.message?.trim() || '';
  if (name === 'NotAllowedError' || msg.toLowerCase().includes('permission')) {
    return forVideo
      ? 'Camera (or microphone) access was denied. Allow access in your browser settings or system permissions and try again.'
      : 'Microphone access was denied. Allow access in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || msg.toLowerCase().includes('not found')) {
    return forVideo
      ? 'No camera or microphone found. Connect a webcam and microphone, then try again. You can use the voice call (📞) if you only have a microphone.'
      : 'No microphone found. Connect a microphone and try again.';
  }
  if (name === 'NotReadableError' || msg.toLowerCase().includes('could not start') || msg.toLowerCase().includes('videoinput failed')) {
    return 'Camera or microphone is in use by another app, or the device could not be opened. Close other apps using the camera and try again.';
  }
  if (msg) return msg;
  return forVideo ? 'Could not access camera or microphone.' : 'Could not access microphone.';
}

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

function MessageAttachment({ type, url, isOutgoing, onImageClick }) {
  const label = type === 'video' ? 'Video' : 'Photo';
  const isImage = type === 'image';
  return (
    <div className={`message-attachment message-attachment--${type || 'image'} ${isOutgoing ? 'message-attachment--outgoing' : ''}`}>
      {isImage && url ? (
        <>
          <img
            src={url}
            alt=""
            className="message-attachment-media"
            loading="lazy"
            onClick={() => (onImageClick ? onImageClick(url) : window.open(url, '_blank'))}
          />
          <a href={url} target="_blank" rel="noopener noreferrer" className="message-attachment-download" onClick={(e) => e.stopPropagation()}>
            Open / Download
          </a>
        </>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="message-attachment-link">
          <span className="message-attachment-icon" aria-hidden>{type === 'video' ? '▶' : '🖼'}</span>
          <span className="message-attachment-label">{label}</span>
          <span className="message-attachment-hint">Open / Download</span>
        </a>
      )}
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
  hasMoreMessages,
  onLoadMore,
  onlineUserIds,
  onBack,
  onClose,
  onNewMessage,
  onSendMessage,
  onMessageUpdated,
  onMessageDeleted,
  onMessageHidden,
  onReadReceipt,
  onDeleteChat,
  socket,
}) {
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [reelViewUrl, setReelViewUrl] = useState(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState(null);
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const listRef = useRef(null);
  const loadMoreRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const emitTypingRef = useRef(null);
  // Voice/video call: null | 'calling' | 'incoming' | 'connected'
  const [callStatus, setCallStatus] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null); // { fromUserId, offer, video? }
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [localStream, setLocalStream] = useState(null); // for video preview
  const [callMuted, setCallMuted] = useState(false);
  const [callVideoOff, setCallVideoOff] = useState(false);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null); // single stream we add remote tracks to
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const isVideoCallRef = useRef(false);

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

  // Voice/video call: cleanup peer connection and streams
  const closeVoiceCall = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((t) => remoteStreamRef.current.removeTrack(t));
      remoteStreamRef.current = null;
    }
    isVideoCallRef.current = false;
    setCallStatus(null);
    setIncomingOffer(null);
    setIsVideoCall(false);
    setLocalStream(null);
    setCallMuted(false);
    setCallVideoOff(false);
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach((t) => { t.enabled = !t.enabled; });
    setCallMuted((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((t) => { t.enabled = !t.enabled; });
    setCallVideoOff((prev) => !prev);
  }, []);

  const createPcWithHandlers = useCallback((stream, otherId, isVideo) => {
    isVideoCallRef.current = isVideo;
    // One remote stream per call: we add tracks as ontrack fires (avoids overwriting when audio/video arrive separately)
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (isVideo && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    } else if (!isVideo && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pc.ontrack = (e) => {
      const track = e.track;
      if (!track || !remoteStreamRef.current) return;
      if (remoteStreamRef.current.getTracks().some((t) => t.id === track.id)) return;
      remoteStreamRef.current.addTrack(track);
      // If refs weren’t set when we created the PC (e.g. React mount order), set them when first track arrives
      if (isVideoCallRef.current && remoteVideoRef.current && !remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      } else if (!isVideoCallRef.current && remoteAudioRef.current && !remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && socket) socket.emit('voice_call_ice', { toUserId: otherId, candidate: e.candidate });
    };
    return pc;
  }, [socket]);

  const startVoiceCall = useCallback(async () => {
    if (!socket || !otherUser || callStatus) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPcWithHandlers(stream, otherUser.id, false);
      peerConnectionRef.current = pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_call_offer', { toUserId: otherUser.id, offer });
      setCallStatus('calling');
    } catch (err) {
      window.alert(getMediaErrorMessage(err, false));
      closeVoiceCall();
    }
  }, [socket, otherUser?.id, callStatus, closeVoiceCall, createPcWithHandlers]);

  const startVideoCall = useCallback(async () => {
    if (!socket || !otherUser || callStatus) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVideoCall(true);
      const pc = createPcWithHandlers(stream, otherUser.id, true);
      peerConnectionRef.current = pc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('voice_call_offer', { toUserId: otherUser.id, offer, video: true });
      setCallStatus('calling');
    } catch (err) {
      window.alert(getMediaErrorMessage(err, true));
      closeVoiceCall();
    }
  }, [socket, otherUser?.id, callStatus, closeVoiceCall, createPcWithHandlers]);

  const acceptVoiceCall = useCallback(async () => {
    const { fromUserId, offer, video } = incomingOffer || {};
    if (!socket || !otherUser || fromUserId !== otherUser.id || !offer) return;
    const withVideo = !!video;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        withVideo ? { audio: true, video: true } : { audio: true }
      );
      localStreamRef.current = stream;
      if (withVideo) {
        setLocalStream(stream);
        setIsVideoCall(true);
      }
      const pc = createPcWithHandlers(stream, otherUser.id, withVideo);
      peerConnectionRef.current = pc;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice_call_answer', { toUserId: otherUser.id, answer });
      setIncomingOffer(null);
      setCallStatus('connected');
    } catch (err) {
      window.alert(getMediaErrorMessage(err, withVideo));
      closeVoiceCall();
    }
  }, [socket, otherUser, incomingOffer, closeVoiceCall, createPcWithHandlers]);

  const declineVoiceCall = useCallback(() => {
    if (incomingOffer && socket && otherUser) {
      socket.emit('voice_call_hangup', { toUserId: otherUser.id });
    }
    setIncomingOffer(null);
    setCallStatus(null);
  }, [socket, otherUser?.id, incomingOffer]);

  const hangUpVoiceCall = useCallback(() => {
    if (socket && otherUser) socket.emit('voice_call_hangup', { toUserId: otherUser.id });
    closeVoiceCall();
  }, [socket, otherUser?.id, closeVoiceCall]);

  // Voice call socket listeners
  useEffect(() => {
    if (!socket || !otherUser) return;
    const handleOffer = ({ fromUserId, offer, video }) => {
      if (fromUserId !== otherUser.id) return;
      setIncomingOffer({ fromUserId, offer, video: !!video });
      setCallStatus('incoming');
    };
    const handleAnswer = ({ fromUserId, answer }) => {
      if (fromUserId !== otherUser.id || !peerConnectionRef.current) return;
      peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer)).catch(() => {});
      setCallStatus('connected');
    };
    const handleIce = ({ fromUserId, candidate }) => {
      if (fromUserId !== otherUser.id || !peerConnectionRef.current || !candidate) return;
      peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    };
    const handleHangup = ({ fromUserId }) => {
      if (fromUserId !== otherUser.id) return;
      closeVoiceCall();
    };
    socket.on('voice_call_offer', handleOffer);
    socket.on('voice_call_answer', handleAnswer);
    socket.on('voice_call_ice', handleIce);
    socket.on('voice_call_hangup', handleHangup);
    return () => {
      socket.off('voice_call_offer', handleOffer);
      socket.off('voice_call_answer', handleAnswer);
      socket.off('voice_call_ice', handleIce);
      socket.off('voice_call_hangup', handleHangup);
    };
  }, [socket, otherUser?.id, closeVoiceCall]);

  // Attach remote stream to video element when it mounts (e.g. caller’s UI) so both sides show remote video
  useEffect(() => {
    if (!isVideoCall || !callStatus || callStatus === 'incoming') return;
    const stream = remoteStreamRef.current;
    const el = remoteVideoRef.current;
    if (el && stream && !el.srcObject) el.srcObject = stream;
  }, [isVideoCall, callStatus]);

  // Cleanup voice call on unmount or when switching chat
  useEffect(() => {
    return () => { closeVoiceCall(); };
  }, [otherUser?.id, closeVoiceCall]);

  const handleLoadMore = useCallback(() => {
    if (!otherUser || !onLoadMore || !hasMoreMessages || loadingMore || !messages.length) return;
    const oldestId = messages.reduce((min, m) => (typeof m.id === 'number' && (!min || m.id < min) ? m.id : min), null);
    if (oldestId == null) return;
    setLoadingMore(true);
    onLoadMore(otherUser.id, oldestId).finally(() => setLoadingMore(false));
  }, [otherUser, onLoadMore, hasMoreMessages, loadingMore, messages]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMoreMessages || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) handleLoadMore();
      },
      { root: listRef.current, rootMargin: '100px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMoreMessages, onLoadMore, loadingMore, handleLoadMore]);

  useEffect(() => {
    if (menuMessageId == null) return;
    const onDocClick = (e) => {
      if (e.target.closest('.message-menu') || e.target.closest('.message-dropdown-trigger')) return;
      setMenuMessageId(null);
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [menuMessageId]);

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
          <button
            type="button"
            className="conversation-call-btn"
            onClick={startVoiceCall}
            disabled={!!callStatus || !onlineUserIds?.has(otherUser.id)}
            title="Voice call"
            aria-label="Start voice call"
          >
            <span className="conversation-call-icon" aria-hidden>📞</span>
          </button>
          <button
            type="button"
            className="conversation-call-btn conversation-call-btn-video"
            onClick={startVideoCall}
            disabled={!!callStatus || !onlineUserIds?.has(otherUser.id)}
            title="Video call"
            aria-label="Start video call"
          >
            <span className="conversation-call-icon" aria-hidden>📹</span>
          </button>
          {onDeleteChat && (
            <button type="button" className="btn-delete-chat" onClick={onDeleteChat} title="Delete chat">
              Delete chat
            </button>
          )}
          {onClose && (
            <button type="button" className="conversation-close" onClick={onClose} aria-label="Close chat" title="Close chat">
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
      </header>

      {callStatus && (
        <div className="voice-call-bar">
          {callStatus === 'calling' && (
            <>
              <span className="voice-call-text">{isVideoCall ? 'Starting video call' : 'Calling'} {(otherUser.display_name || otherUser.username)}…</span>
              <button type="button" className="voice-call-hangup" onClick={hangUpVoiceCall} aria-label="Cancel call">Hang up</button>
            </>
          )}
          {callStatus === 'incoming' && (
            <>
              <span className="voice-call-text">{incomingOffer?.video ? 'Incoming video call from' : 'Incoming call from'} {(otherUser.display_name || otherUser.username)}</span>
              <button type="button" className="voice-call-accept" onClick={acceptVoiceCall} aria-label="Accept">Accept</button>
              <button type="button" className="voice-call-hangup" onClick={declineVoiceCall} aria-label="Decline">Decline</button>
            </>
          )}
          {callStatus === 'connected' && !isVideoCall && (
            <>
              <span className="voice-call-text voice-call-connected">● Voice call with {(otherUser.display_name || otherUser.username)}</span>
              <button type="button" className={`voice-call-mute ${callMuted ? 'voice-call-mute--on' : ''}`} onClick={toggleMute} aria-label={callMuted ? 'Unmute' : 'Mute'} title={callMuted ? 'Unmute' : 'Mute'}>
                {callMuted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" className="voice-call-hangup" onClick={hangUpVoiceCall} aria-label="Hang up">Hang up</button>
            </>
          )}
        </div>
      )}

      {callStatus && isVideoCall && (callStatus === 'calling' || callStatus === 'connected') && (
        <div className="video-call-area">
          <div className="video-call-remote">
            <video ref={remoteVideoRef} autoPlay playsInline className="video-call-video" />
            <span className="video-call-label video-call-label-remote">{(otherUser.display_name || otherUser.username)}</span>
          </div>
          <div className="video-call-local">
            <video srcObject={localStream ?? undefined} muted autoPlay playsInline className="video-call-video video-call-video-local" />
            {callVideoOff && <span className="video-call-camera-off-label">Camera off</span>}
            <span className="video-call-label">You</span>
          </div>
          {callStatus === 'connected' && (
            <div className="video-call-controls">
              <button type="button" className={`video-call-control-btn ${callMuted ? 'video-call-control-btn--on' : ''}`} onClick={toggleMute} aria-label={callMuted ? 'Unmute' : 'Mute'} title={callMuted ? 'Unmute' : 'Mute'}>
                <span className="video-call-control-icon" aria-hidden>{callMuted ? '🔇' : '🎤'}</span>
                <span className="video-call-control-label">{callMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button type="button" className={`video-call-control-btn ${callVideoOff ? 'video-call-control-btn--on' : ''}`} onClick={toggleVideo} aria-label={callVideoOff ? 'Turn camera on' : 'Turn camera off'} title={callVideoOff ? 'Turn camera on' : 'Turn camera off'}>
                <span className="video-call-control-icon" aria-hidden>{callVideoOff ? '📷' : '📹'}</span>
                <span className="video-call-control-label">{callVideoOff ? 'Camera on' : 'Camera off'}</span>
              </button>
              <button type="button" className="video-call-hangup-btn" onClick={hangUpVoiceCall} aria-label="Hang up">Hang up</button>
            </div>
          )}
        </div>
      )}

      <audio ref={remoteAudioRef} autoPlay playsInline aria-hidden />

      <div className="conversation-messages" ref={listRef}>
        {hasMoreMessages && (
          <div ref={loadMoreRef} className="conversation-load-more">
            <button type="button" className="conversation-load-more-btn" onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
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
                  {!pending && (
                    <button
                      type="button"
                      className="message-dropdown-trigger"
                      onClick={(e) => { e.stopPropagation(); setMenuMessageId(menuMessageId === msg.id ? null : msg.id); }}
                      aria-label="Message options"
                      aria-expanded={menuMessageId === msg.id}
                    >
                      <span className="message-dropdown-icon" aria-hidden>⋮</span>
                    </button>
                  )}
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
                          <MessageAttachment
                            type={msg.attachment_type}
                            url={msg.attachment_url}
                            isOutgoing={isOutgoing}
                            onImageClick={setLightboxImageUrl}
                          />
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

      {lightboxImageUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxImageUrl(null)} role="dialog" aria-label="Image preview">
          <button type="button" className="lightbox-close" onClick={() => setLightboxImageUrl(null)} aria-label="Close">×</button>
          <img src={lightboxImageUrl} alt="" className="lightbox-image" onClick={(e) => e.stopPropagation()} />
          <a href={lightboxImageUrl} target="_blank" rel="noopener noreferrer" className="lightbox-download" onClick={(e) => e.stopPropagation()}>
            Open / Download
          </a>
        </div>
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
