import { useState, useEffect, useRef, useCallback } from 'react';
import { conversationsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { getImageUrl } from '../utils/imageUrl';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Paperclip, X, FileText, Check, CheckCheck,
  User, RefreshCw, AlertCircle, Clock, ShieldCheck
} from 'lucide-react';

export default function AuctionDiscussionBox({ listing }) {
  const { user } = useAuth();
  const { socket } = useSocket();

  const isSeller = user && listing && user._id === listing.seller?._id;

  // Conversations state (for seller: list of threads; for buyer: single active conversation)
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Input state
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState('');

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load conversations for this listing
  const loadConversations = useCallback(async () => {
    if (!user || !listing?._id) return;
    try {
      setLoading(true);
      if (isSeller) {
        // Seller sees all buyer conversations for this listing
        const { data } = await conversationsApi.getListingConversations(listing._id);
        setConversations(data.conversations || []);
        if (data.conversations?.length > 0 && !activeConv) {
          setActiveConv(data.conversations[0]);
        }
      } else {
        // Buyer creates or fetches their single private conversation with seller
        const { data } = await conversationsApi.getOrCreateAuction(listing._id);
        if (data.conversation) {
          setActiveConv(data.conversation);
          setConversations([data.conversation]);
        }
      }
    } catch (err) {
      console.error('Failed to load auction conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user, listing, isSeller]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when active conversation changes
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      setLoadingMessages(true);
      const { data } = await conversationsApi.getMessages(convId, { limit: 100 });
      setMessages(data.messages || []);
      // Mark as read
      await conversationsApi.markAsRead(convId);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
      setTimeout(scrollToBottom, 100);
    }
  }, []);

  useEffect(() => {
    if (activeConv?._id) {
      loadMessages(activeConv._id);
    }
  }, [activeConv?._id, loadMessages]);

  // Socket.IO real-time listeners for active conversation
  useEffect(() => {
    if (!socket || !activeConv?._id) return;

    const token = localStorage.getItem('access_token');
    socket.emit('conversation:join', { conversationId: activeConv._id, token });

    const handleNewMessage = ({ message, conversationId }) => {
      if (conversationId === activeConv._id) {
        setMessages((prev) => {
          // Avoid duplicate by _id or clientTempId
          if (prev.some((m) => m._id === message._id || (message.clientTempId && m.clientTempId === message.clientTempId))) {
            return prev.map((m) => (m.clientTempId === message.clientTempId ? message : m));
          }
          return [...prev, message];
        });
        setTimeout(scrollToBottom, 50);

        // Mark as read if received message from other party
        if (message.sender?._id !== user?._id) {
          conversationsApi.markAsRead(activeConv._id);
        }
      }
    };

    const handleReadReceipt = ({ conversationId, readerId }) => {
      if (conversationId === activeConv._id && readerId !== user?._id) {
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            readBy: Array.from(new Set([...(m.readBy || []), readerId])),
          }))
        );
      }
    };

    const handleTypingUpdate = ({ conversationId, username, isTyping: typing }) => {
      if (conversationId === activeConv._id) {
        setOtherUserTyping(typing ? `@${username} is typing…` : '');
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:read_receipt', handleReadReceipt);
    socket.on('conversation:typing_update', handleTypingUpdate);

    return () => {
      socket.emit('conversation:leave', activeConv._id);
      socket.off('message:new', handleNewMessage);
      socket.off('message:read_receipt', handleReadReceipt);
      socket.off('conversation:typing_update', handleTypingUpdate);
    };
  }, [socket, activeConv?._id, user?._id]);

  // Handle typing status emission
  const handleTyping = (e) => {
    setText(e.target.value);
    if (!socket || !activeConv?._id) return;

    const token = localStorage.getItem('access_token');
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('conversation:typing', { conversationId: activeConv._id, token, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('conversation:typing', { conversationId: activeConv._id, token, isTyping: false });
    }, 2000);
  };

  // Attachment file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const validFiles = [];

    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`File "${f.name}" exceeds 10 MB limit`);
        continue;
      }
      validFiles.push(f);
    }

    if (attachments.length + validFiles.length > 3) {
      toast.error('Maximum 3 attachments per message allowed');
      return;
    }

    setAttachments((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Send message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if ((!text.trim() && attachments.length === 0) || sending || !activeConv?._id) return;

    const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const optimisticMessage = {
      _id: clientTempId,
      clientTempId,
      sender: {
        _id: user._id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      content: text.trim(),
      attachments: attachments.map((f) => ({
        url: URL.createObjectURL(f),
        filename: f.name,
        originalName: f.name,
        mimeType: f.type,
        size: f.size,
      })),
      createdAt: new Date().toISOString(),
      readBy: [user._id],
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setText('');
    const filesToSend = [...attachments];
    setAttachments([]);
    setSending(true);
    setTimeout(scrollToBottom, 50);

    try {
      const formData = new FormData();
      formData.append('content', optimisticMessage.content);
      formData.append('clientTempId', clientTempId);
      filesToSend.forEach((f) => {
        formData.append('attachments', f);
      });

      const { data } = await conversationsApi.sendMessage(activeConv._id, formData);
      if (data.message) {
        setMessages((prev) =>
          prev.map((m) => (m.clientTempId === clientTempId ? data.message : m))
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send message');
      setMessages((prev) => prev.filter((m) => m._id !== clientTempId));
    } finally {
      setSending(false);
    }
  };

  // Participant resolution
  const otherParticipant = activeConv?.participants?.find((p) => p._id !== user?._id);

  if (!user) {
    return (
      <div className="glass rounded-2xl p-8 text-center border border-white/5 flex flex-col items-center justify-center gap-3">
        <MessageSquare size={36} className="text-brand-400 opacity-60" />
        <h4 className="font-700 text-slate-200">Sign in to ask the seller</h4>
        <p className="text-slate-400 text-sm max-w-sm">
          Have questions about condition, specifications, or pickup? Sign in to start a private discussion with the seller.
        </p>
        <a href="/login" className="btn btn-primary btn-sm mt-2">
          Login to Ask Seller
        </a>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden flex flex-col h-[520px]">
      {/* Discussion Header */}
      <div className="p-4 bg-surface-800/80 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <MessageSquare size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-700 text-sm text-slate-100">
                {isSeller ? 'Buyer Questions & Inquiries' : 'Ask Seller a Question'}
              </h4>
              <span className="text-[10px] bg-brand-500/15 text-brand-300 px-2 py-0.5 rounded-full border border-brand-400/20 font-600">
                Private Q&A
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isSeller
                ? otherParticipant ? `Chatting with @${otherParticipant.username}` : 'No active inquiries'
                : `Direct message with seller @${listing.seller?.username}`}
            </p>
          </div>
        </div>

        <button
          onClick={loadConversations}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          title="Refresh messages"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Main Discussion Workspace: Sidebar for seller (if multiple buyers) + Chat pane */}
      <div className="flex flex-1 min-h-0">
        {/* If Seller and there are buyer threads, show buyer list column */}
        {isSeller && conversations.length > 1 && (
          <div className="w-48 sm:w-56 border-r border-white/8 bg-surface-900/60 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-2.5 text-[11px] font-700 text-slate-400 uppercase tracking-wider border-b border-white/5">
              Buyers ({conversations.length})
            </div>
            <div className="flex-1 divide-y divide-white/5">
              {conversations.map((c) => {
                const buyer = c.buyer || c.participants?.find((p) => p._id !== user._id);
                const isSelected = activeConv?._id === c._id;
                return (
                  <button
                    key={c._id}
                    onClick={() => setActiveConv(c)}
                    className={`w-full p-2.5 text-left flex items-start gap-2.5 transition-all ${
                      isSelected ? 'bg-brand-500/15 border-l-2 border-brand-400' : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-surface-700 flex items-center justify-center text-xs font-700 text-slate-300 shrink-0 mt-0.5">
                      {buyer?.username?.[0]?.toUpperCase() || 'B'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-600 text-slate-200 truncate">@{buyer?.username}</span>
                        {c.unreadCount > 0 && (
                          <span className="w-4 h-4 rounded-full bg-brand-500 text-white text-[10px] font-700 flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {c.lastMessagePreview || 'New inquiry'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat Messages Pane */}
        <div className="flex-1 flex flex-col min-h-0 bg-surface-900/40">
          {/* Privacy Notice Banner */}
          <div className="px-4 py-2 bg-brand-500/5 border-b border-white/5 text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck size={13} className="text-brand-400 shrink-0" />
            <span>This discussion is private between you and the other party. Inappropriate conduct may be reported.</span>
          </div>

          {/* Messages scroll area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingMessages ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                <RefreshCw size={16} className="animate-spin mr-2" /> Loading discussion…
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MessageSquare size={32} className="text-slate-600 mb-2" />
                <p className="text-sm font-600 text-slate-300">
                  {isSeller ? 'No messages in this inquiry yet.' : 'No messages yet.'}
                </p>
                <p className="text-xs text-slate-500 max-w-xs mt-1">
                  {isSeller
                    ? 'Wait for the buyer to ask a question, or introduce yourself.'
                    : 'Ask the seller about the item’s condition, defects, pickup location, or warranty.'}
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const isMine = m.sender?._id === user._id;
                const isRead = m.readBy?.some((r) => r !== user._id);
                return (
                  <div
                    key={m._id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[85%] ${
                      isMine ? 'ml-auto' : 'mr-auto'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 px-1">
                      <span className="font-600 text-slate-300">
                        {isMine ? 'You' : `@${m.sender?.username}`}
                      </span>
                      <span>·</span>
                      <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        isMine
                          ? 'bg-brand-600 text-white rounded-br-xs shadow-md'
                          : 'bg-surface-800 text-slate-200 border border-white/5 rounded-bl-xs'
                      }`}
                    >
                      {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}

                      {/* Attachments */}
                      {m.attachments?.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {m.attachments.map((att, idx) => {
                            const isImg = att.mimeType?.startsWith('image/');
                            return (
                              <div key={idx} className="rounded-lg overflow-hidden border border-white/10 bg-black/20">
                                {isImg ? (
                                  <a href={att.url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={att.url}
                                      alt={att.originalName}
                                      className="max-h-48 w-auto rounded-lg object-contain hover:opacity-90"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 text-xs text-brand-300 hover:underline"
                                  >
                                    <FileText size={16} />
                                    <span className="truncate">{att.originalName}</span>
                                    <span className="text-[10px] text-slate-400">({Math.round(att.size / 1024)} KB)</span>
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Read receipt indicator for sender */}
                    {isMine && (
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-0.5 pr-1">
                        {isRead ? (
                          <span className="flex items-center gap-0.5 text-brand-400">
                            <CheckCheck size={11} /> Read
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <Check size={11} /> Sent
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {otherUserTyping && (
              <div className="text-xs text-brand-400 italic px-2 animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
                {otherUserTyping}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending attachments preview */}
          {attachments.length > 0 && (
            <div className="px-3 py-2 bg-surface-800/90 border-t border-white/5 flex items-center gap-2 overflow-x-auto">
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 bg-surface-700 text-slate-200 text-xs px-2.5 py-1 rounded-lg border border-white/10 shrink-0"
                >
                  <Paperclip size={12} className="text-brand-400" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="text-slate-400 hover:text-rose-400 ml-1"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Message input bar */}
          <form onSubmit={handleSendMessage} className="p-3 bg-surface-800/80 border-t border-white/8 flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-brand-400 hover:bg-white/5 rounded-xl transition-colors shrink-0"
              title="Attach image or PDF (max 10MB)"
            >
              <Paperclip size={18} />
            </button>

            <input
              type="text"
              value={text}
              onChange={handleTyping}
              placeholder={isSeller ? 'Reply to buyer inquiry…' : 'Ask seller a question about this item…'}
              maxLength={2000}
              className="input flex-1 text-sm py-2 px-3 bg-surface-900 border-white/10 focus:border-brand-400"
            />

            <button
              type="submit"
              disabled={(!text.trim() && attachments.length === 0) || sending}
              className="btn btn-primary btn-sm px-3.5 py-2 shrink-0 flex items-center gap-1.5 disabled:opacity-40"
            >
              {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
