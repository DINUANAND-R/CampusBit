import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { assistantApi, bidsApi } from '../../api';
import { getImageUrl, FALLBACK_IMAGE } from '../../utils/imageUrl';
import {
  Sparkles,
  Send,
  RotateCcw,
  ExternalLink,
  Scale,
  Gavel,
  Clock,
  Tag,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  X,
  ChevronRight,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SUGGESTED_PROMPTS = [
  'Find me a cycle under ₹2,000',
  'Show laptops under ₹15,000',
  'Find a scientific calculator under ₹400',
  'Compare two cycles',
  'Show auctions ending soon',
  'Help me bid on a product',
];

const INITIAL_MESSAGE = {
  id: 'welcome',
  sender: 'assistant',
  timestamp: new Date().toISOString(),
  text: "Hello! I'm CampusBid's rule-based shopping assistant. I help you discover student listings within your budget, compare products side-by-side, check auctions ending soon, and guide you through safe proxy bidding.\n\nType a search request below or tap any suggested prompt to get started!",
  intent: 'WELCOME',
  listings: [],
};

export default function AssistantPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  // Session-based message state
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('campusbid_assistant_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [INITIAL_MESSAGE];
  });

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Comparison selection tray (max 2 items)
  const [compareItems, setCompareItems] = useState([]);

  // Bidding modal / drawer state
  const [biddingListing, setBiddingListing] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [bidConfirmed, setBidConfirmed] = useState(false);

  const messagesEndRef = useRef(null);

  // Sync messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('campusbid_assistant_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Real-time synchronization via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleBidUpdate = (data) => {
      if (!data || !data.listingId) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.listings || msg.listings.length === 0) return msg;
          const updatedListings = msg.listings.map((l) => {
            if (l._id === data.listingId) {
              const newPrice = data.currentPrice || l.currentPrice;
              const newBidCount = (l.bidCount || 0) + 1;
              return {
                ...l,
                currentPrice: newPrice,
                bidCount: newBidCount,
                minNextBid: newPrice + (l.minBidIncrement || 10),
                priceType: 'Current bid',
                status: data.status || l.status,
              };
            }
            return l;
          });
          return { ...msg, listings: updatedListings };
        })
      );
    };

    const handleAuctionStatus = (data) => {
      if (!data || !data.listingId) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (!msg.listings || msg.listings.length === 0) return msg;
          const updatedListings = msg.listings.map((l) =>
            l._id === data.listingId ? { ...l, status: data.status } : l
          );
          return { ...msg, listings: updatedListings };
        })
      );
    };

    socket.on('auction:bid_update', handleBidUpdate);
    socket.on('auction:status', handleAuctionStatus);

    return () => {
      socket.off('auction:bid_update', handleBidUpdate);
      socket.off('auction:status', handleAuctionStatus);
    };
  }, [socket]);

  // Send a message
  const handleSend = async (messageText = input) => {
    const text = (messageText || '').trim();
    if (!text || loading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toISOString(),
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Pass comparison items if student selected them
      const context = {};
      if (compareItems.length >= 2) {
        context.compareListingIds = compareItems.map((item) => item._id);
      }

      const { data } = await assistantApi.chat(text, context);

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        text: data.reply || 'I reviewed the database for matching auctions.',
        intent: data.intent || 'SEARCH_LISTINGS',
        filters: data.filters || null,
        listings: data.listings || [],
        comparison: data.comparison || null,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      console.error('[AssistantPage] Query error:', err);
      const errorMsg = {
        id: `assistant-err-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        text: 'Sorry, I encountered an issue while searching the database. Please check your network connection and try again.',
        intent: 'ERROR',
        listings: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Clear Chat History
  const handleClearChat = () => {
    sessionStorage.removeItem('campusbid_assistant_history');
    setMessages([INITIAL_MESSAGE]);
    setCompareItems([]);
    setBiddingListing(null);
    toast.success('Chat cleared');
  };

  // Toggle listing in comparison tray
  const handleToggleCompare = (listing) => {
    setCompareItems((prev) => {
      const exists = prev.some((x) => x._id === listing._id);
      if (exists) {
        return prev.filter((x) => x._id !== listing._id);
      }
      if (prev.length >= 2) {
        toast('Comparison tray updated with latest 2 items', { icon: '🔄' });
        return [prev[1], listing];
      }
      return [...prev, listing];
    });
  };

  // Trigger compare on tray items
  const handleCompareTray = async () => {
    if (compareItems.length < 2) {
      toast.error('Please select 2 products to compare.');
      return;
    }
    const prompt = `Compare "${compareItems[0].title}" and "${compareItems[1].title}"`;
    await handleSend(prompt);
  };

  // Open Bidding Workflow
  const handleStartBidding = (listing) => {
    if (!user) {
      toast.error('Please login to place bids.');
      navigate('/login');
      return;
    }
    if (listing.seller?._id && listing.seller._id.toString() === user._id?.toString()) {
      toast.error('You cannot bid on your own listing.');
      return;
    }
    setBiddingListing(listing);
    setBidAmount(String(listing.minNextBid || listing.currentPrice + 10));
    setBidConfirmed(false);
  };

  // Submit Confirmed Proxy Bid
  const handleConfirmBid = async () => {
    if (!biddingListing || !user) return;
    const maxAmountNum = Number(bidAmount);
    const minRequired = biddingListing.minNextBid || biddingListing.currentPrice + 10;

    if (!maxAmountNum || isNaN(maxAmountNum) || maxAmountNum < minRequired) {
      toast.error(`Maximum bid must be at least ₹${minRequired.toLocaleString('en-IN')}`);
      return;
    }

    setBidSubmitting(true);
    try {
      const { data } = await bidsApi.setProxy(biddingListing._id, maxAmountNum);
      toast.success(`Proxy bid confirmed! Max: ₹${maxAmountNum.toLocaleString('en-IN')}`);

      // Add confirmation reply into chat stream
      const confirmReply = {
        id: `bid-confirm-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toISOString(),
        text: `✅ Bid confirmed for "${biddingListing.title}"!\n\nYour maximum authorized proxy bid is ₹${maxAmountNum.toLocaleString('en-IN')}.\nCurrent price: ₹${data.listing?.currentPrice?.toLocaleString('en-IN') || biddingListing.currentPrice}.\n\nCampusBid's automated engine will only increment your bid when competing bids arrive.`,
        intent: 'BID_CONFIRMED',
        listings: data.listing ? [data.listing] : [biddingListing],
      };
      setMessages((prev) => [...prev, confirmReply]);
      setBiddingListing(null);
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to place proxy bid';
      toast.error(errMsg);
    } finally {
      setBidSubmitting(false);
    }
  };

  // Helper format remaining time
  const formatTimeLeft = (endsAt) => {
    if (!endsAt) return null;
    const diff = new Date(endsAt) - new Date();
    if (diff <= 0) return 'Ended';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h left`;
    }
    return `${hours}h ${mins}m left`;
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-surface-900 flex flex-col text-slate-100">
      {/* ── Top Header ───────────────────────────────────────────────────────── */}
      <div className="border-b border-white/8 bg-surface-800/80 backdrop-blur-md sticky top-14 z-20 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-500 via-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Sparkles size={20} className="text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-700 text-base sm:text-lg text-white">
                  CampusBid AI Assistant
                </h1>
                <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300">
                  Rule-Based Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Natural-language product discovery, comparisons, and guided bidding using real database data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="clear-assistant-chat-btn"
              onClick={handleClearChat}
              className="btn btn-secondary btn-sm py-1.5 px-3 text-xs flex items-center gap-1.5 text-slate-400 hover:text-white"
              title="Clear Chat History"
            >
              <RotateCcw size={13} />
              <span className="hidden sm:inline">Clear Chat</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Comparison Tray Floating Banner ─────────────────────────────────── */}
      {compareItems.length > 0 && (
        <div className="bg-brand-950/80 border-b border-brand-500/30 px-4 py-2 sticky top-[118px] z-20 backdrop-blur-md">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Scale size={14} className="text-brand-400 shrink-0" />
              <span className="text-slate-300">
                Selected for comparison ({compareItems.length}/2):
              </span>
              <div className="flex items-center gap-1.5">
                {compareItems.map((item) => (
                  <span
                    key={item._id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-700 border border-white/10 text-slate-200"
                  >
                    <span className="max-w-[120px] truncate">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleCompare(item)}
                      className="hover:text-rose-400"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {compareItems.length === 2 && (
                <button
                  type="button"
                  id="compare-tray-btn"
                  onClick={handleCompareTray}
                  className="btn btn-primary btn-sm py-1 px-2.5 text-xs font-600 flex items-center gap-1 shadow-sm"
                >
                  <Scale size={12} /> Compare Now
                </button>
              )}
              <button
                type="button"
                onClick={() => setCompareItems([])}
                className="text-slate-400 hover:text-slate-200 p-1"
                title="Clear comparison selection"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat Messages Container ─────────────────────────────────────────── */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 overflow-y-auto space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-3 ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {/* Assistant Avatar */}
            {msg.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-brand-500/20 mt-1">
                <Sparkles size={14} className="text-white" />
              </div>
            )}

            {/* Bubble Body */}
            <div
              className={`max-w-[92%] sm:max-w-[85%] md:max-w-[78%] rounded-2xl p-4 text-sm ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-600/15 rounded-tr-none'
                  : 'bg-surface-800 border border-white/8 text-slate-200 shadow-md rounded-tl-none'
              }`}
            >
              {/* Message Content */}
              <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

              {/* Active Filter Chips */}
              {msg.filters && Object.keys(msg.filters).some((k) => msg.filters[k] !== null && msg.filters[k] !== false && (Array.isArray(msg.filters[k]) ? msg.filters[k].length > 0 : true)) && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/6 text-[11px]">
                  {msg.filters.category && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-500/15 border border-brand-500/30 text-brand-300">
                      Category: {msg.filters.category}
                    </span>
                  )}
                  {msg.filters.condition && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                      Condition: {msg.filters.condition}
                    </span>
                  )}
                  {msg.filters.maxPrice !== null && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      Budget: ≤ ₹{msg.filters.maxPrice?.toLocaleString('en-IN')}
                    </span>
                  )}
                  {msg.filters.minPrice !== null && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                      Min: ≥ ₹{msg.filters.minPrice?.toLocaleString('en-IN')}
                    </span>
                  )}
                  {msg.filters.isEndingSoon && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300">
                      Ending Soon
                    </span>
                  )}
                </div>
              )}

              {/* Side-by-Side Product Comparison Card */}
              {msg.comparison && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="bg-surface-900/80 border border-brand-500/30 rounded-xl p-4 shadow-inner">
                    <div className="flex items-center gap-2 mb-3 text-brand-300 font-display font-600 text-xs uppercase tracking-wider">
                      <Scale size={14} className="text-brand-400" />
                      Side-by-Side Objective Comparison
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Item A */}
                      <div className="bg-surface-800/90 rounded-lg p-3.5 border border-white/6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-700 px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 uppercase">
                              Option A
                            </span>
                            <span className="text-xs text-slate-400">{msg.comparison.itemA.category}</span>
                          </div>
                          <h4 className="font-display font-700 text-slate-100 text-sm mb-1 line-clamp-2">
                            {msg.comparison.itemA.title}
                          </h4>
                          <div className="space-y-1.5 text-xs text-slate-300 my-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Current Price:</span>
                              <span className="font-700 text-emerald-400">₹{msg.comparison.itemA.currentPrice?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Condition:</span>
                              <span className="font-600 text-slate-200 capitalize">{msg.comparison.itemA.condition}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Next Minimum Bid:</span>
                              <span className="text-slate-300">₹{msg.comparison.itemA.minNextBid?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Time Left:</span>
                              <span className="text-amber-400">{formatTimeLeft(msg.comparison.itemA.endsAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/6">
                          <Link
                            to={`/listings/${msg.comparison.itemA._id}`}
                            className="btn btn-secondary btn-sm flex-1 text-center py-1 text-xs"
                          >
                            View Details
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleStartBidding(msg.comparison.itemA)}
                            className="btn btn-primary btn-sm flex-1 text-center py-1 text-xs font-600"
                          >
                            Bid
                          </button>
                        </div>
                      </div>

                      {/* Item B */}
                      <div className="bg-surface-800/90 rounded-lg p-3.5 border border-white/6 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-700 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase">
                              Option B
                            </span>
                            <span className="text-xs text-slate-400">{msg.comparison.itemB.category}</span>
                          </div>
                          <h4 className="font-display font-700 text-slate-100 text-sm mb-1 line-clamp-2">
                            {msg.comparison.itemB.title}
                          </h4>
                          <div className="space-y-1.5 text-xs text-slate-300 my-2">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Current Price:</span>
                              <span className="font-700 text-emerald-400">₹{msg.comparison.itemB.currentPrice?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Condition:</span>
                              <span className="font-600 text-slate-200 capitalize">{msg.comparison.itemB.condition}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Next Minimum Bid:</span>
                              <span className="text-slate-300">₹{msg.comparison.itemB.minNextBid?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Time Left:</span>
                              <span className="text-amber-400">{formatTimeLeft(msg.comparison.itemB.endsAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/6">
                          <Link
                            to={`/listings/${msg.comparison.itemB._id}`}
                            className="btn btn-secondary btn-sm flex-1 text-center py-1 text-xs"
                          >
                            View Details
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleStartBidding(msg.comparison.itemB)}
                            className="btn btn-primary btn-sm flex-1 text-center py-1 text-xs font-600"
                          >
                            Bid
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Product Result Grid */}
              {msg.listings && msg.listings.length > 0 && !msg.comparison && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-600 text-slate-300">
                      Live Matching Auctions ({msg.listings.length})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Real-time database records
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {msg.listings.map((l) => {
                      const isComparing = compareItems.some((x) => x._id === l._id);
                      const imgUrl = l.images?.[0] ? getImageUrl(l.images[0]) : FALLBACK_IMAGE;

                      return (
                        <div
                          key={l._id}
                          className="bg-surface-900/90 border border-white/8 hover:border-brand-500/40 rounded-xl overflow-hidden flex flex-col justify-between transition-all group"
                        >
                          <div>
                            {/* Card Image */}
                            <div className="relative aspect-video w-full bg-surface-950 overflow-hidden">
                              <img
                                src={imgUrl}
                                alt={l.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => { e.target.src = FALLBACK_IMAGE; }}
                              />
                              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                                <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-surface-900/80 backdrop-blur-md text-slate-300 border border-white/10 capitalize">
                                  {l.category}
                                </span>
                                <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-surface-900/80 backdrop-blur-md text-emerald-400 border border-emerald-500/30 capitalize">
                                  {l.condition}
                                </span>
                              </div>
                              {l.endsAt && (
                                <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-950/80 backdrop-blur-md text-[11px] font-600 text-amber-300 border border-amber-500/30">
                                  <Clock size={11} />
                                  <span>{formatTimeLeft(l.endsAt)}</span>
                                </div>
                              )}
                            </div>

                            {/* Card Details */}
                            <div className="p-3">
                              <h4 className="font-display font-700 text-slate-100 text-sm line-clamp-1 group-hover:text-brand-300 transition-colors">
                                {l.title}
                              </h4>

                              <div className="flex items-baseline justify-between mt-2">
                                <div>
                                  <span className="text-[11px] text-slate-400 block">
                                    {l.priceType || 'Current bid'}:
                                  </span>
                                  <span className="font-display font-700 text-base text-emerald-400">
                                    ₹{l.currentPrice?.toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[11px] text-slate-400 block">
                                    Min Next Bid:
                                  </span>
                                  <span className="text-xs font-600 text-slate-300">
                                    ₹{l.minNextBid?.toLocaleString('en-IN')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-white/6">
                                <span>Seller: @{l.seller?.username || 'Student'}</span>
                                <span>{l.bidCount || 0} {l.bidCount === 1 ? 'bid' : 'bids'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Card Actions */}
                          <div className="p-3 pt-0 grid grid-cols-3 gap-1.5">
                            <Link
                              to={`/listings/${l._id}`}
                              className="btn btn-secondary btn-sm py-1.5 text-[11px] flex items-center justify-center gap-1 text-slate-300 hover:text-white"
                              title="View listing details"
                            >
                              <ExternalLink size={12} /> View
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleToggleCompare(l)}
                              className={`btn btn-secondary btn-sm py-1.5 text-[11px] flex items-center justify-center gap-1 ${
                                isComparing
                                  ? 'border-brand-400 text-brand-300 bg-brand-500/10'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                              title="Compare this item"
                            >
                              <Scale size={12} /> {isComparing ? 'Selected' : 'Compare'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartBidding(l)}
                              className="btn btn-primary btn-sm py-1.5 text-[11px] font-600 flex items-center justify-center gap-1 shadow-sm"
                              title="Initiate proxy bid"
                            >
                              <Gavel size={12} /> Bid
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* User Avatar */}
            {msg.sender === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-surface-700 border border-white/10 flex items-center justify-center shrink-0 mt-1 text-xs font-bold text-slate-200">
                {user?.username ? user.username[0].toUpperCase() : 'U'}
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-brand-500/20">
              <Sparkles size={14} className="text-white animate-spin" />
            </div>
            <div className="bg-surface-800 border border-white/8 rounded-2xl rounded-tl-none p-4 text-sm text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
              <span>Searching real campus listings and evaluating criteria…</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Suggested Prompts & Chat Input Dock ──────────────────────────────── */}
      <div className="border-t border-white/8 bg-surface-800/90 backdrop-blur-md p-4 sticky bottom-0 z-10">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* Quick Prompts Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-slate-500 shrink-0 font-600 text-[11px]">Suggested:</span>
            {SUGGESTED_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={loading}
                className="whitespace-nowrap px-3 py-1.5 rounded-full bg-surface-700/80 hover:bg-surface-600 text-slate-300 hover:text-white border border-white/6 hover:border-brand-400/40 transition-all text-xs shrink-0 cursor-pointer disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Chat Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <input
              id="assistant-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything, e.g., 'Find me a cycle under ₹2,000' or 'Compare laptops'…"
              disabled={loading}
              className="input flex-1 py-3 px-4 text-sm bg-surface-900 border-white/10 focus:border-brand-500"
            />
            <button
              id="assistant-send-btn"
              type="submit"
              disabled={loading || !input.trim()}
              className="btn btn-primary py-3 px-5 flex items-center gap-2 font-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={15} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>

      {/* ── Bidding Confirmation Modal ──────────────────────────────────────── */}
      {biddingListing && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-800 border border-white/15 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Gavel size={18} className="text-brand-400" />
                <h3 className="font-display font-700 text-base text-slate-100">
                  Assistant Proxy Bidding
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBiddingListing(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X size={18} />
              </button>
            </div>

            {/* Listing Summary */}
            <div className="bg-surface-900 rounded-xl p-3.5 border border-white/6 flex items-center gap-3">
              <img
                src={biddingListing.images?.[0] ? getImageUrl(biddingListing.images[0]) : FALLBACK_IMAGE}
                alt={biddingListing.title}
                className="w-14 h-14 rounded-lg object-cover bg-surface-950 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-700 text-sm text-slate-100 truncate">
                  {biddingListing.title}
                </h4>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-slate-400">Current Price:</span>
                  <span className="font-700 text-emerald-400">
                    ₹{biddingListing.currentPrice?.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Minimum Required:</span>
                  <span className="font-600 text-slate-300">
                    ₹{biddingListing.minNextBid?.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* Maximum Bid Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-600 text-slate-300">
                Your Maximum Authorized Bid (₹)
              </label>
              <input
                type="number"
                min={biddingListing.minNextBid || biddingListing.currentPrice + 10}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="input py-2.5 px-3 text-base font-display font-700 text-emerald-300 bg-surface-900"
                placeholder={`Min ₹${biddingListing.minNextBid || biddingListing.currentPrice + 10}`}
              />
              <p className="text-[11px] text-slate-400 leading-normal">
                CampusBid automated proxy bidding will place the lowest required bid (₹{biddingListing.minNextBid?.toLocaleString('en-IN')}) and only increment up to your confirmed maximum if other students place competing bids.
              </p>
            </div>

            {/* Explicit Approval Warning Banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-600 text-amber-200">Explicit Student Confirmation Required</p>
                <p className="text-amber-300/80 mt-0.5">
                  Bids are binding commitments under CampusBid campus auction policies. You will never be charged above ₹{Number(bidAmount || 0).toLocaleString('en-IN')}.
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBiddingListing(null)}
                className="btn btn-secondary btn-sm py-2 px-4 text-xs"
                disabled={bidSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-proxy-bid-btn"
                onClick={handleConfirmBid}
                disabled={bidSubmitting || !bidAmount || Number(bidAmount) < (biddingListing.minNextBid || 0)}
                className="btn btn-primary btn-sm py-2 px-5 text-xs font-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                {bidSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Confirming…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={14} />
                    <span>Confirm & Place Bid</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
