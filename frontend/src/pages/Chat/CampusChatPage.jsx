import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { conversationsApi, itemRequestsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import toast from 'react-hot-toast';
import {
  MessageSquare, Send, Paperclip, Search, Plus, User, Clock,
  FileText, Check, CheckCheck, X, ArrowLeft, Tag, DollarSign,
  AlertCircle, ShieldCheck, Sparkles, Filter, CheckCircle2, ChevronRight
} from 'lucide-react';

const CATEGORIES = [
  { id: 'ALL', label: 'All Requests' },
  { id: 'textbooks', label: 'Textbooks' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'clothing', label: 'Clothing' },
  { id: 'sports', label: 'Sports Gear' },
  { id: 'notes', label: 'Notes & Study' },
  { id: 'appliances', label: 'Appliances' },
  { id: 'other', label: 'Other' },
];

export default function CampusChatPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active view: 'conversations' | 'requests'
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'requests' ? 'requests' : 'conversations');
  const [searchQuery, setSearchQuery] = useState('');

  // Conversations state
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);

  // Message input state
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState('');

  // Mobile navigation state
  const [showMobileChat, setShowMobileChat] = useState(false);

  // Item Requests state
  const [itemRequests, setItemRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestCategory, setRequestCategory] = useState('ALL');
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [newRequestForm, setNewRequestForm] = useState({
    title: '',
    category: 'textbooks',
    description: '',
    budgetMin: '',
    budgetMax: '',
    neededBy: '',
  });

  // Direct Chat modal state
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directRecipientUsername, setDirectRecipientUsername] = useState('');
  const [startingDirect, setStartingDirect] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      setLoadingConvs(true);
      const { data } = await conversationsApi.getAll({ search: searchQuery });
      setConversations(data.conversations || []);

      // If URL param specifies conv id, select it
      const targetConvId = searchParams.get('conv');
      if (targetConvId) {
        const found = data.conversations.find((c) => c._id === targetConvId);
        if (found) {
          setSelectedConv(found);
          setShowMobileChat(true);
        } else {
          // Fetch directly
          try {
            const res = await conversationsApi.getOne(targetConvId);
            if (res.data?.conversation) {
              setSelectedConv(res.data.conversation);
              setShowMobileChat(true);
            }
          } catch {}
        }
      } else if (!selectedConv && data.conversations?.length > 0 && window.innerWidth >= 768) {
        setSelectedConv(data.conversations[0]);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  }, [searchQuery, searchParams]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load Item Requests
  const loadItemRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const { data } = await itemRequestsApi.getAll({
        category: requestCategory,
        q: searchQuery,
        status: 'OPEN',
      });
      setItemRequests(data.itemRequests || []);
    } catch (err) {
      console.error('Failed to load item requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [requestCategory, searchQuery]);

  useEffect(() => {
    if (activeTab === 'requests') {
      loadItemRequests();
    }
  }, [activeTab, loadItemRequests]);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      setLoadingMessages(true);
      const { data } = await conversationsApi.getMessages(convId, { limit: 100 });
      setMessages(data.messages || []);
      // Mark as read
      await conversationsApi.markAsRead(convId);
      // Update local unread counter in conversation item
      setConversations((prev) =>
        prev.map((c) => (c._id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
      setTimeout(scrollToBottom, 50);
    }
  }, []);

  useEffect(() => {
    if (selectedConv?._id) {
      loadMessages(selectedConv._id);
    }
  }, [selectedConv?._id, loadMessages]);

  // Socket.IO listeners
  useEffect(() => {
    if (!socket) return;

    // Listen for global user room conversation updates
    const handleConversationUpdate = ({ conversationId, lastMessage, lastMessagePreview }) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => c._id === conversationId);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            lastMessage,
            lastMessagePreview,
            lastMessageAt: new Date().toISOString(),
            unreadCount: selectedConv?._id === conversationId ? 0 : (updated[index].unreadCount || 0) + 1,
          };
          // Move to top
          const [moved] = updated.splice(index, 1);
          return [moved, ...updated];
        }
        return prev;
      });
    };

    socket.on('conversation:update', handleConversationUpdate);
    return () => {
      socket.off('conversation:update', handleConversationUpdate);
    };
  }, [socket, selectedConv?._id]);

  // Socket.IO listeners for selected conversation
  useEffect(() => {
    if (!socket || !selectedConv?._id) return;

    const token = localStorage.getItem('access_token');
    socket.emit('conversation:join', { conversationId: selectedConv._id, token });

    const handleNewMessage = ({ message, conversationId }) => {
      if (conversationId === selectedConv._id) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === message._id || (message.clientTempId && m.clientTempId === message.clientTempId))) {
            return prev.map((m) => (m.clientTempId === message.clientTempId ? message : m));
          }
          return [...prev, message];
        });
        setTimeout(scrollToBottom, 50);

        if (message.sender?._id !== user?._id) {
          conversationsApi.markAsRead(selectedConv._id);
        }
      }
    };

    const handleReadReceipt = ({ conversationId, readerId }) => {
      if (conversationId === selectedConv._id && readerId !== user?._id) {
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            readBy: Array.from(new Set([...(m.readBy || []), readerId])),
          }))
        );
      }
    };

    const handleTypingUpdate = ({ conversationId, username, isTyping: typing }) => {
      if (conversationId === selectedConv._id) {
        setOtherUserTyping(typing ? `@${username} is typing…` : '');
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:read_receipt', handleReadReceipt);
    socket.on('conversation:typing_update', handleTypingUpdate);

    return () => {
      socket.emit('conversation:leave', selectedConv._id);
      socket.off('message:new', handleNewMessage);
      socket.off('message:read_receipt', handleReadReceipt);
      socket.off('conversation:typing_update', handleTypingUpdate);
    };
  }, [socket, selectedConv?._id, user?._id]);

  // Typing handler
  const handleTyping = (e) => {
    setText(e.target.value);
    if (!socket || !selectedConv?._id) return;

    const token = localStorage.getItem('access_token');
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('conversation:typing', { conversationId: selectedConv._id, token, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('conversation:typing', { conversationId: selectedConv._id, token, isTyping: false });
    }, 2000);
  };

  // Attachment handler
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
    if ((!text.trim() && attachments.length === 0) || sending || !selectedConv?._id) return;

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

      const { data } = await conversationsApi.sendMessage(selectedConv._id, formData);
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

  // Create new Looking-for-Item Request
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!newRequestForm.title.trim() || !newRequestForm.description.trim()) {
      toast.error('Title and description are required');
      return;
    }

    setSubmittingRequest(true);
    try {
      const { data } = await itemRequestsApi.create(newRequestForm);
      toast.success('Looking-for-item request posted to marketplace!');
      setShowNewRequestModal(false);
      setNewRequestForm({
        title: '',
        category: 'textbooks',
        description: '',
        budgetMin: '',
        budgetMax: '',
        neededBy: '',
      });
      loadItemRequests();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to post request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Start chat with requester
  const handleContactRequester = async (reqId) => {
    try {
      const { data } = await conversationsApi.getOrCreateRequest(reqId);
      if (data.conversation) {
        setSelectedConv(data.conversation);
        setActiveTab('conversations');
        setShowMobileChat(true);
        loadConversations();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open conversation');
    }
  };

  // Start direct chat by username
  const handleStartDirectChat = async (e) => {
    e.preventDefault();
    if (!directRecipientUsername.trim()) return;

    setStartingDirect(true);
    try {
      // Find user or call direct endpoint if ID
      // If client supplied username, let's find user or pass recipientId
      const target = directRecipientUsername.trim();
      // Look up target via conversations or query
      const { data } = await conversationsApi.getOrCreateDirect(target);
      if (data.conversation) {
        toast.success('Conversation opened');
        setSelectedConv(data.conversation);
        setShowDirectModal(false);
        setDirectRecipientUsername('');
        setShowMobileChat(true);
        loadConversations();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start conversation with student');
    } finally {
      setStartingDirect(false);
    }
  };

  // Resolve other participant
  const otherParticipant = selectedConv?.participants?.find((p) => p._id !== user?._id);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display font-800 text-2xl text-slate-100 flex items-center gap-2.5">
              <MessageSquare className="text-brand-400" size={26} />
              Campus Marketplace Chat
            </h1>
            <span className="badge bg-brand-500/10 text-brand-300 border border-brand-400/20 text-xs font-600">
              Live Messaging
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Connect directly with campus peers to buy, sell, request items, or clarify auction details.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewRequestModal(true)}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <Sparkles size={14} className="text-gold-400" />
            <span>Post Item Request</span>
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="glass rounded-2xl border border-white/10 overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100vh-210px)] min-h-[580px]">
        {/* Left Panel (Conversations & Requests) */}
        <div
          className={`md:col-span-5 lg:col-span-4 border-r border-white/8 bg-surface-900/60 flex flex-col min-h-0 ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Navigation Tabs (Chats vs Looking for Item) */}
          <div className="p-3 border-b border-white/8 grid grid-cols-2 gap-1.5 bg-surface-800/40">
            <button
              onClick={() => { setActiveTab('conversations'); setSearchParams({}); }}
              className={`py-2 px-3 rounded-xl text-xs font-700 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'conversations'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <MessageSquare size={14} />
              <span>Messages</span>
              {conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0) > 0 && (
                <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
                  {conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0)}
                </span>
              )}
            </button>

            <button
              onClick={() => { setActiveTab('requests'); setSearchParams({ tab: 'requests' }); }}
              className={`py-2 px-3 rounded-xl text-xs font-700 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'requests'
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Tag size={14} />
              <span>Looking for Items</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'conversations' ? 'Search messages, peers…' : 'Search wanted items…'}
                className="input pl-9 py-1.5 text-xs bg-surface-900 border-white/10"
              />
            </div>
          </div>

          {/* Tab 1: Conversations List */}
          {activeTab === 'conversations' && (
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {loadingConvs ? (
                <div className="p-8 text-center text-slate-500 text-xs">Loading conversations…</div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <MessageSquare size={32} className="text-slate-600 mb-1" />
                  <p className="text-sm font-600 text-slate-300">No conversations yet</p>
                  <p className="text-xs text-slate-500 max-w-xs">
                    Start a discussion from any auction listing or respond to student item requests.
                  </p>
                </div>
              ) : (
                conversations.map((c) => {
                  const participant = c.participants?.find((p) => p._id !== user._id);
                  const isSelected = selectedConv?._id === c._id;
                  const isAuction = c.type === 'auction';
                  const isRequest = c.type === 'request';

                  return (
                    <button
                      key={c._id}
                      onClick={() => {
                        setSelectedConv(c);
                        setShowMobileChat(true);
                      }}
                      className={`w-full p-3 text-left flex items-start gap-3 transition-all ${
                        isSelected
                          ? 'bg-brand-500/15 border-l-3 border-brand-400'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-sm font-700 text-white shrink-0 mt-0.5 relative">
                        {participant?.username?.[0]?.toUpperCase() || '?'}
                        {c.unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 border-2 border-surface-900 text-white text-[9px] font-bold flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>

                      {/* Content preview */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-700 text-xs text-slate-200 truncate">
                            @{participant?.username || 'Student'}
                          </span>
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                          </span>
                        </div>

                        {/* Context pill: Auction or Request */}
                        {isAuction && c.listing && (
                          <div className="flex items-center gap-1 text-[10px] text-brand-300 truncate mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                            <span className="truncate">Auction: {c.listing.title}</span>
                          </div>
                        )}
                        {isRequest && c.itemRequest && (
                          <div className="flex items-center gap-1 text-[10px] text-amber-300 truncate mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span className="truncate">Wanted: {c.itemRequest.title}</span>
                          </div>
                        )}

                        <p className="text-xs text-slate-400 truncate mt-1">
                          {c.lastMessagePreview || 'Conversation opened'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 2: Looking for Items List */}
          {activeTab === 'requests' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Category selector */}
              <div className="p-2 border-b border-white/5 flex items-center gap-1.5 overflow-x-auto shrink-0">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setRequestCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-600 shrink-0 transition-colors ${
                      requestCategory === cat.id
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-400 hover:text-slate-200 bg-surface-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Requests list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {loadingRequests ? (
                  <div className="p-8 text-center text-slate-500 text-xs">Loading requests…</div>
                ) : itemRequests.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Tag size={32} className="text-slate-600 mb-1" />
                    <p className="text-sm font-600 text-slate-300">No requests in this category</p>
                    <p className="text-xs text-slate-500 max-w-xs">
                      Be the first to post what textbook, gadget, or item you're looking for on campus!
                    </p>
                    <button
                      onClick={() => setShowNewRequestModal(true)}
                      className="btn btn-primary btn-sm mt-2"
                    >
                      Post a Request
                    </button>
                  </div>
                ) : (
                  itemRequests.map((req) => {
                    const isOwner = req.requester?._id === user?._id;
                    return (
                      <div
                        key={req._id}
                        className="glass rounded-xl p-3.5 border border-white/8 hover:border-brand-500/30 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-700 uppercase tracking-wider text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-md border border-brand-400/20">
                              {req.category}
                            </span>
                            <h4 className="font-700 text-sm text-slate-100 mt-1 leading-snug">
                              {req.title}
                            </h4>
                          </div>

                          {(req.budgetMin !== null || req.budgetMax !== null) && (
                            <span className="text-xs font-700 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-400/20 shrink-0">
                              ₹{req.budgetMin || 0} - ₹{req.budgetMax || 'Any'}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                          {req.description}
                        </p>

                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-white/5">
                          <span>By @{req.requester?.username}</span>
                          {isOwner ? (
                            <span className="text-brand-300 font-600">Your Request</span>
                          ) : (
                            <button
                              onClick={() => handleContactRequester(req._id)}
                              className="text-xs text-brand-400 hover:text-brand-300 font-600 flex items-center gap-1 hover:underline"
                            >
                              Message Requester <ChevronRight size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel (Active Conversation Thread) */}
        <div
          className={`md:col-span-7 lg:col-span-8 flex flex-col min-h-0 bg-surface-900/40 ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedConv ? (
            <>
              {/* Conversation Header */}
              <div className="p-3.5 bg-surface-800/80 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  {/* Mobile back button */}
                  <button
                    onClick={() => setShowMobileChat(false)}
                    className="md:hidden p-1.5 text-slate-400 hover:text-slate-200"
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-sm font-700 text-white shrink-0">
                    {otherParticipant?.username?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div>
                    <h3 className="font-700 text-sm text-slate-100 flex items-center gap-2">
                      @{otherParticipant?.username || 'Student Peer'}
                      {otherParticipant?.campusId && (
                        <span className="text-[10px] text-slate-400 font-normal">
                          · {otherParticipant.campusId}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {selectedConv.type === 'auction' ? 'Auction Discussion' : selectedConv.type === 'request' ? 'Item Request Discussion' : 'Direct Campus Message'}
                    </p>
                  </div>
                </div>

                {/* Auction/Item Request badge link */}
                {selectedConv.type === 'auction' && selectedConv.listing && (
                  <Link
                    to={`/listings/${selectedConv.listing._id}`}
                    className="hidden sm:flex items-center gap-2 text-xs bg-brand-500/10 border border-brand-500/20 text-brand-300 py-1 px-2.5 rounded-xl hover:bg-brand-500/20 transition-colors"
                  >
                    <span className="truncate max-w-[120px] font-600">{selectedConv.listing.title}</span>
                    <ChevronRight size={13} />
                  </Link>
                )}
              </div>

              {/* Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                    Loading conversation messages…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                    <MessageSquare size={36} className="text-slate-600 mb-2" />
                    <p className="text-sm font-600 text-slate-300">Conversation started</p>
                    <p className="text-xs text-slate-500 max-w-xs mt-1">
                      Send a message to introduce yourself or clarify terms, specs, or handover details.
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.sender?._id === user._id;
                    const isRead = m.readBy?.some((r) => r !== user._id);
                    return (
                      <div
                        key={m._id}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[80%] ${
                          isMine ? 'ml-auto' : 'mr-auto'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-slate-400 px-1">
                          <span className="font-600 text-slate-300">
                            {isMine ? 'You' : `@${m.sender?.username}`}
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            isMine
                              ? 'bg-brand-600 text-white rounded-br-xs shadow-md'
                              : 'bg-surface-800 text-slate-200 border border-white/5 rounded-bl-xs'
                          }`}
                        >
                          {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}

                          {/* Attachments */}
                          {m.attachments?.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {m.attachments.map((att, idx) => {
                                const isImg = att.mimeType?.startsWith('image/');
                                return (
                                  <div
                                    key={idx}
                                    className="rounded-lg overflow-hidden border border-white/10 bg-black/20"
                                  >
                                    {isImg ? (
                                      <a href={att.url} target="_blank" rel="noopener noreferrer">
                                        <img
                                          src={att.url}
                                          alt={att.originalName}
                                          className="max-h-56 w-auto rounded-lg object-contain hover:opacity-90"
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
                                        <span className="text-[10px] text-slate-400">
                                          ({Math.round(att.size / 1024)} KB)
                                        </span>
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Read receipts */}
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

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="p-3 bg-surface-800/80 border-t border-white/8 flex items-center gap-2 shrink-0">
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
                  title="Attach image or PDF document"
                >
                  <Paperclip size={18} />
                </button>

                <input
                  type="text"
                  value={text}
                  onChange={handleTyping}
                  placeholder="Type a message to peer…"
                  maxLength={2000}
                  className="input flex-1 text-sm py-2 px-3 bg-surface-900 border-white/10 focus:border-brand-400"
                />

                <button
                  type="submit"
                  disabled={(!text.trim() && attachments.length === 0) || sending}
                  className="btn btn-primary btn-sm px-4 py-2 shrink-0 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Send size={14} />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            /* Empty state when no conversation is selected */
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 mb-4">
                <MessageSquare size={32} />
              </div>
              <h3 className="font-display font-700 text-lg text-slate-200">Campus Marketplace Chat</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1 mb-6 leading-relaxed">
                Select a conversation on the left to review message history, or browse student requests to help a classmate.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setActiveTab('requests'); setSearchParams({ tab: 'requests' }); }}
                  className="btn btn-secondary btn-sm"
                >
                  Browse Item Requests
                </button>
                <button
                  onClick={() => setShowNewRequestModal(true)}
                  className="btn btn-primary btn-sm"
                >
                  Post a Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Looking-for-Item Modal */}
      {showNewRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl max-w-lg w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <Sparkles size={18} className="text-gold-400" /> Post Looking-For-Item Request
              </h3>
              <button
                onClick={() => setShowNewRequestModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Need a calculator, textbook, or equipment? Announce it here so campus sellers can message you directly.
            </p>

            <form onSubmit={handleCreateRequest} className="space-y-3.5">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  What item are you looking for? *
                </label>
                <input
                  value={newRequestForm.title}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, title: e.target.value })}
                  placeholder="e.g. TI-84 Plus CE Calculator, Organic Chemistry 8th Ed"
                  className="input text-sm"
                  maxLength={120}
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Category *
                </label>
                <select
                  value={newRequestForm.category}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, category: e.target.value })}
                  className="input text-sm"
                >
                  <option value="textbooks">Textbooks</option>
                  <option value="electronics">Electronics</option>
                  <option value="furniture">Furniture</option>
                  <option value="clothing">Clothing</option>
                  <option value="sports">Sports</option>
                  <option value="notes">Notes & Study Aids</option>
                  <option value="appliances">Appliances</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Description / Requirements *
                </label>
                <textarea
                  value={newRequestForm.description}
                  onChange={(e) => setNewRequestForm({ ...newRequestForm, description: e.target.value })}
                  placeholder="Specify edition, acceptable condition, or deadline..."
                  className="input text-sm min-h-[80px] resize-none"
                  maxLength={1000}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                    Min Budget (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newRequestForm.budgetMin}
                    onChange={(e) => setNewRequestForm({ ...newRequestForm, budgetMin: e.target.value })}
                    placeholder="Optional"
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                    Max Budget (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newRequestForm.budgetMax}
                    onChange={(e) => setNewRequestForm({ ...newRequestForm, budgetMax: e.target.value })}
                    placeholder="Optional"
                    className="input text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewRequestModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={submittingRequest}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-1.5"
                >
                  {submittingRequest ? 'Posting…' : 'Publish Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
