import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { listingsApi, bidsApi, reportsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import Countdown from '../../components/Countdown';
import AuctionDiscussionBox from '../../components/AuctionDiscussionBox';
import toast from 'react-hot-toast';
import {
  Gavel, TrendingUp, User, Clock, ChevronRight,
  Zap, AlertTriangle, CheckCircle, XCircle, Package, Edit3, Calendar, Trash2, X, Flag, Eye, MessageSquare, Handshake,
  ShieldCheck, Lock, Sparkles, Play, Film
} from 'lucide-react';
import { getImageUrl, getVideoUrl } from '../../utils/imageUrl';

const conditionBadge = {
  new:        'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  'like-new': 'bg-brand-400/10   text-brand-400   border-brand-400/20',
  good:       'bg-gold-400/10    text-gold-400    border-gold-400/20',
  fair:       'bg-slate-400/10   text-slate-400   border-slate-400/20',
};

export default function ListingDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user }   = useAuth();
  const { socket } = useSocket();
  const navigate   = useNavigate();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') === 'discussion' ? 'discussion' : 'bids');

  const [listing, setListing] = useState(null);
  const [bids, setBids]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding]     = useState(false);
  const [bidError, setBidError]   = useState('');
  const [imgIdx, setImgIdx]       = useState(0);
  const [extended, setExtended]   = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('inappropriate_content');
  const [reportDescription, setReportDescription] = useState('');
  const [proxyBid, setProxyBid] = useState(null);
  const [proxyAmount, setProxyAmount] = useState('');
  const [settingProxy, setSettingProxy] = useState(false);
  const [proxyError, setProxyError] = useState('');
  const [bidMode, setBidMode] = useState('proxy'); // 'proxy' or 'manual'
  const [activeMedia, setActiveMedia] = useState('image'); // 'image' | 'video'
  const [videoError, setVideoError] = useState(false);

  const bidListRef = useRef(null);

  // Load listing + bid history + user's proxy commitment
  const load = useCallback(async () => {
    try {
      const [{ data: ld }, { data: bd }] = await Promise.all([
        listingsApi.getOne(id),
        bidsApi.history(id),
      ]);
      setListing(ld.listing);
      setBids(bd.bids || []);
      const nextMin = (ld.listing.leadingBid || ld.listing.winner)
        ? ld.listing.currentPrice + ld.listing.minBidIncrement
        : ld.listing.startingPrice + ld.listing.minBidIncrement;
      setBidAmount(String(nextMin || ''));

      if (user) {
        try {
          const { data: pd } = await bidsApi.getProxy(id);
          setProxyBid(pd.proxyBid || null);
          if (pd.proxyBid) {
            setProxyAmount(String(pd.proxyBid.maxAmount));
          } else {
            setProxyAmount(String(nextMin || ''));
          }
        } catch {}
      }
    } catch {
      toast.error('Listing not found or not active');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, user, navigate]);

  useEffect(() => { load(); }, [load]);

  // Socket.IO — join auction room + listen for events
  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('auction:join', id);

    const onBidUpdate = (data) => {
      if (data.listingId !== id) return;
      setListing((prev) => prev ? { ...prev, currentPrice: data.amount, endsAt: data.endsAt } : prev);
      setBids((prev) => [{
        _id: Date.now(),
        bidder: { username: data.bidderName },
        amount: data.amount,
        isLateBid: data.isLateBid,
        createdAt: new Date().toISOString(),
      }, ...prev]);
      bidListRef.current?.firstElementChild?.classList.add('bid-flash');
    };

    const onExtended = (data) => {
      if (data.listingId !== id) return;
      setListing((prev) => prev ? { ...prev, endsAt: data.newEndsAt } : prev);
      setExtended(true);
      toast('⚡ Auction extended by 30 seconds!', { icon: '⚡', duration: 4000 });
      setTimeout(() => setExtended(false), 4000);
    };

    const onClosed = (data) => {
      if (data.listingId !== id) return;
      setListing((prev) => prev ? { ...prev, status: data.winner ? 'closed' : 'unsold', winner: data.winner } : prev);
      if (data.winner) {
        toast.success(`Auction closed! Winner: ${data.winner}`, { duration: 6000 });
      } else {
        toast(`Auction ended unsold. ${data.reason || ''}`, { icon: '📦' });
      }
    };

    const onCancelled = (data) => {
      if (data.listingId !== id) return;
      setListing((prev) => prev ? {
        ...prev,
        status: 'cancelled',
        cancellationReason: data.reason,
        cancelledAt: data.cancelledAt,
      } : prev);
      toast.error(`This auction was cancelled: ${data.reason || 'by seller'}`);
    };

    const onStatusChange = (data) => {
      if (data.listingId !== id) return;
      setListing((prev) => prev ? {
        ...prev,
        status: data.status,
        endsAt: data.endsAt || prev.endsAt,
      } : prev);
    };

    const onProxyLeading = (data) => {
      if (data.listingId !== id) return;
      toast.success('✨ Your maximum bid is currently leading!');
      load();
    };

    const onProxyOutbid = (data) => {
      if (data.listingId !== id) return;
      toast.error(`⚠️ You've been outbid! Current lead: ₹${data.currentPrice?.toLocaleString()}`, { duration: 5000 });
      load();
    };

    const onProxyUpdated = (data) => {
      if (data.listingId !== id) return;
      setProxyBid((prev) => ({
        ...(prev || {}),
        maxAmount: data.maxAmount,
        status: data.isLeader ? 'active' : 'outbid',
      }));
    };

    const onError = ({ message }) => toast.error(message);

    socket.on('auction:bid_update', onBidUpdate);
    socket.on('auction:extended',   onExtended);
    socket.on('auction:closed',     onClosed);
    socket.on('auction:cancelled',  onCancelled);
    socket.on('auction:status_change', onStatusChange);
    socket.on('auction:error',      onError);
    socket.on('proxy:leading',      onProxyLeading);
    socket.on('proxy:outbid',       onProxyOutbid);
    socket.on('proxy:updated',      onProxyUpdated);

    return () => {
      socket.emit('auction:leave', id);
      socket.off('auction:bid_update', onBidUpdate);
      socket.off('auction:extended',   onExtended);
      socket.off('auction:closed',     onClosed);
      socket.off('auction:cancelled',  onCancelled);
      socket.off('auction:status_change', onStatusChange);
      socket.off('auction:error',      onError);
      socket.off('proxy:leading',      onProxyLeading);
      socket.off('proxy:outbid',       onProxyOutbid);
      socket.off('proxy:updated',      onProxyUpdated);
    };
  }, [socket, id]);

  const placeBid = async () => {
    setBidError('');
    const amount = Number(bidAmount);
    if (!user) { toast.error('Please login to bid'); navigate('/login'); return; }
    if (!amount || isNaN(amount)) { setBidError('Enter a valid amount'); return; }
    const min = listing.currentPrice + listing.minBidIncrement;
    if (amount < min) { setBidError(`Minimum bid is ₹${min}`); return; }

    setBidding(true);
    try {
      await bidsApi.place(id, amount);
      setBidAmount(String(amount + listing.minBidIncrement));
      toast.success(`Bid of ₹${amount} placed!`);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Bid failed';
      setBidError(msg);
      toast.error(msg);
    } finally {
      setBidding(false);
    }
  };

  const handleSetProxyBid = async (e) => {
    e?.preventDefault();
    setProxyError('');
    const amount = Number(proxyAmount);
    if (!user) { toast.error('Please login to set maximum bid'); navigate('/login'); return; }
    if (!amount || isNaN(amount) || !Number.isInteger(amount) || amount <= 0) {
      setProxyError('Enter a valid whole amount in ₹');
      return;
    }
    const hasBids = Boolean(listing.leadingBid || listing.winner);
    const minRequired = hasBids
      ? listing.currentPrice + listing.minBidIncrement
      : listing.startingPrice + listing.minBidIncrement;

    const isCurrentLeader = user?._id && listing.winner && (listing.winner._id === user._id || listing.winner === user._id);

    if (amount < minRequired && !isCurrentLeader) {
      setProxyError(`Maximum bid must be at least ₹${minRequired.toLocaleString()}`);
      return;
    }

    if (isCurrentLeader && amount < listing.currentPrice) {
      setProxyError(`Cannot set maximum lower than your current committed price ₹${listing.currentPrice.toLocaleString()}`);
      return;
    }

    setSettingProxy(true);
    try {
      const { data } = await bidsApi.setProxy(id, amount);
      toast.success(data.message || 'Maximum bid placed!');
      setProxyBid(data.proxyBid);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to set maximum bid';
      setProxyError(msg);
      toast.error(msg);
    } finally {
      setSettingProxy(false);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      const { data } = await listingsApi.cancel(id, cancelReason);
      toast.success('Listing cancelled successfully');
      setListing(data.listing);
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel listing');
    } finally {
      setCancelling(false);
    }
  };

  const handleReportSubmit = async (e) => {
    e?.preventDefault();
    if (!user) {
      toast.error('Please login to report this listing');
      navigate('/login');
      return;
    }
    if (!reportDescription.trim()) {
      toast.error('Please provide a description of the issue');
      return;
    }
    setSubmittingReport(true);
    try {
      await reportsApi.create({
        targetType: 'listing',
        targetId: id,
        category: reportCategory,
        description: reportDescription.trim()
      });
      toast.success('Report submitted to administrators for review');
      setShowReportModal(false);
      setReportDescription('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8 animate-pulse">
        <div className="glass rounded-2xl h-80" />
        <div className="glass rounded-2xl h-80" />
      </div>
    );
  }

  if (!listing) return null;

  const isActive = listing.status === 'active';
  const isScheduled = listing.status === 'scheduled';
  const isCancelled = listing.status === 'cancelled';
  const isSeller = user?._id === listing.seller?._id;
  const minBid   = listing.currentPrice + listing.minBidIncrement;
  const images   = listing.images?.length ? listing.images : [];
  const canSellerCancel = isSeller && (isScheduled || (isActive && bids.length === 0));

  const categoryEmoji = { books:'📚',electronics:'💻',clothing:'👕',furniture:'🛋️',sports:'⚽',other:'📦' };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Extension banner */}
      {extended && (
        <div className="mb-6 flex items-center gap-3 bg-gold-400/10 border border-gold-400/30 text-gold-400 rounded-xl px-4 py-3 text-sm font-600 animate-pulse">
          <Zap size={18} /> Auction extended — a bid was placed in the last 30 seconds!
        </div>
      )}

      {/* Scheduled banner */}
      {isScheduled && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-brand-500/10 border border-brand-500/30 text-brand-300 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-brand-400 shrink-0" />
            <div>
              <p className="font-700 text-slate-100">Scheduled Auction (Unpublished Preview)</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Goes live on {new Date(listing.publishAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
          <span className="badge bg-brand-500/20 text-brand-300 self-start sm:self-auto border border-brand-400/30">
            Visible only to seller
          </span>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-6 flex items-start gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl p-4 text-sm">
          <XCircle size={20} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-700 text-rose-200">This auction has been cancelled by the seller</p>
            {listing.cancellationReason && (
              <p className="text-xs text-rose-300/80 mt-0.5">Reason: {listing.cancellationReason}</p>
            )}
            {listing.cancelledAt && (
              <p className="text-[11px] text-slate-500 mt-1">
                Cancelled on {new Date(listing.cancelledAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Status banners */}
      {listing.status === 'unsold' && (
        <div className="mb-6 flex items-center gap-3 bg-slate-500/10 border border-slate-500/30 text-slate-400 rounded-xl px-4 py-3 text-sm font-600">
          <Package size={18} /> This auction ended unsold — no bids met the requirements.
        </div>
      )}
      {listing.status === 'closed' && (
        <div className="mb-6 flex items-center gap-3 bg-emerald-400/10 border border-emerald-400/30 text-emerald-400 rounded-xl px-4 py-3 text-sm font-600">
          <CheckCircle size={18} /> Auction closed — awaiting seller handover decision.
        </div>
      )}
      {listing.status === 'completed' && (
        <div className="mb-6 flex items-center gap-3 bg-brand-400/10 border border-brand-400/30 text-brand-400 rounded-xl px-4 py-3 text-sm font-600">
          <Gavel size={18} /> Handover complete! This auction is finished.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left — image gallery + details */}
        <div className="flex flex-col gap-4">
          {/* Main Image/Video viewer */}
          <div className="glass rounded-2xl overflow-hidden h-72 sm:h-96 flex items-center justify-center relative bg-surface-800">
            {activeMedia === 'video' && listing.video ? (
              <div className="w-full h-full relative bg-black flex items-center justify-center">
                {!videoError ? (
                  <video
                    key={listing.video.url}
                    src={getVideoUrl(listing.video)}
                    controls
                    playsInline
                    preload="metadata"
                    poster={listing.video.posterUrl ? getImageUrl(listing.video.posterUrl) : undefined}
                    className="w-full h-full object-contain"
                    onError={() => setVideoError(true)}
                  >
                    Your browser does not support HTML video playback.
                  </video>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                    <Film size={36} className="text-slate-500" />
                    <p className="text-sm font-600 text-slate-300">Video playback unavailable</p>
                    <p className="text-xs text-slate-500">The video file could not be loaded.</p>
                    <button
                      onClick={() => {
                        setVideoError(false);
                        setActiveMedia('image');
                      }}
                      className="btn btn-secondary btn-sm text-xs mt-2"
                    >
                      View Photos
                    </button>
                  </div>
                )}
              </div>
            ) : images.length > 0 ? (
              <img
                src={getImageUrl(images[imgIdx])}
                alt={listing.title}
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement.querySelector('.detail-fallback');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}

            <div
              className={`detail-fallback w-full h-full items-center justify-center text-7xl ${
                activeMedia === 'image' && images.length === 0 ? 'flex' : 'hidden'
              }`}
            >
              {categoryEmoji[listing.category] || '📦'}
            </div>

            {/* Floating button to watch video when viewing image */}
            {listing.video && activeMedia === 'image' && (
              <button
                onClick={() => setActiveMedia('video')}
                className="absolute bottom-3 right-3 z-10 px-3 py-1.5 rounded-full bg-surface-900/90 backdrop-blur border border-brand-500/30 text-xs font-600 text-slate-200 flex items-center gap-1.5 shadow-xl hover:bg-surface-800 transition-all hover:scale-105"
                title="Watch product video"
              >
                <Play size={12} className="fill-brand-400 text-brand-400 ml-0.5" />
                <span>Play Video</span>
                {listing.video.duration && (
                  <span className="text-[10px] text-slate-400 font-mono">({Math.round(listing.video.duration)}s)</span>
                )}
              </button>
            )}
          </div>

          {/* Thumbnails row (images + video) */}
          {(images.length > 1 || listing.video) && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => {
                const src = getImageUrl(img);
                const isSelected = activeMedia === 'image' && i === imgIdx;
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setActiveMedia('image');
                      setImgIdx(i);
                    }}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                      isSelected
                        ? 'border-brand-400 ring-2 ring-brand-400/30'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={src}
                      alt={`Thumbnail ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                );
              })}

              {/* Video Thumbnail Button */}
              {listing.video && (
                <button
                  onClick={() => setActiveMedia('video')}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all bg-surface-900 flex flex-col items-center justify-center gap-0.5 group ${
                    activeMedia === 'video'
                      ? 'border-brand-400 ring-2 ring-brand-400/30'
                      : 'border-white/10 opacity-70 hover:opacity-100'
                  }`}
                  title="Play product video"
                >
                  <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play size={12} className="fill-brand-400 ml-0.5" />
                  </div>
                  <span className="text-[9px] font-700 tracking-wider text-slate-300 uppercase">
                    Video
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Details */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display font-700 text-2xl text-slate-100 leading-snug">{listing.title}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge border ${conditionBadge[listing.condition]}`}>{listing.condition}</span>
                {isSeller && (isScheduled || isActive || listing.status === 'draft') && (
                  <Link
                    to={`/listings/${id}/edit`}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 py-1 px-2.5 text-xs font-600 text-slate-200 hover:text-white hover:border-brand-400/40"
                    title="Edit product details, photos, or video"
                  >
                    <Edit3 size={12} className="text-brand-400" /> Edit Product
                  </Link>
                )}
                {canSellerCancel && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="btn btn-danger btn-sm flex items-center gap-1.5 py-1 px-2.5 text-xs"
                  >
                    <Trash2 size={12} /> Cancel
                  </button>
                )}
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{listing.description}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
              <div className="flex items-center gap-1.5">
                <User size={14} />
                <span>Sold by <span className="text-slate-200 font-600">@{listing.seller?.username}</span></span>
                {listing.seller?.campusId && <span>· Campus ID: {listing.seller.campusId}</span>}
              </div>
              {listing.viewsCount !== undefined && (
                <div className="flex items-center gap-1 text-xs text-slate-400 bg-surface-800/80 px-2 py-0.5 rounded-md border border-white/5">
                  <Eye size={12} className="text-brand-400" />
                  <span>{listing.viewsCount} views</span>
                </div>
              )}
              {user && !isSeller && (
                <button
                  type="button"
                  onClick={() => { setActiveTab('discussion'); setSearchParams({ tab: 'discussion' }); }}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 transition-colors py-1 px-2 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 border border-brand-400/20"
                >
                  <MessageSquare size={12} /> Ask Seller
                </button>
              )}
              {user && !isSeller && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="ml-auto text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1 transition-colors py-1 px-2 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                  title="Report listing to administrators"
                >
                  <Flag size={12} /> Report Listing
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right — bid panel & discussion switcher */}
        <div className="flex flex-col gap-4">
          {/* Tab Switcher */}
          <div className="glass rounded-xl p-1.5 flex items-center gap-1 border border-white/10">
            <button
              id="tab-bids"
              type="button"
              onClick={() => { setActiveTab('bids'); setSearchParams({}); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-700 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'bids'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Gavel size={14} />
              <span>Bidding & History</span>
            </button>
            <button
              id="tab-discussion"
              type="button"
              onClick={() => { setActiveTab('discussion'); setSearchParams({ tab: 'discussion' }); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-700 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'discussion'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <MessageSquare size={14} />
              <span>{isSeller ? 'Buyer Inquiries' : 'Ask Seller'}</span>
            </button>
          </div>

          {activeTab === 'discussion' ? (
            <AuctionDiscussionBox listing={listing} />
          ) : (
            <>
              {/* Price + timer */}
              <div className="glass rounded-2xl p-6">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
              {isScheduled ? 'Starting price' : 'Current price'}
            </p>
            <p className="font-display font-800 text-4xl gradient-text mb-1">
              ₹{listing.currentPrice?.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Starting price: ₹{listing.startingPrice?.toLocaleString()}
              {listing.reservePrice && ` · Reserve: ₹${listing.reservePrice.toLocaleString()}`}
            </p>

            {isActive && (
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} className="text-brand-400" />
                <span className="text-slate-400 text-sm">Ends in:</span>
                <Countdown endsAt={listing.endsAt} />
              </div>
            )}

            {isScheduled && (
              <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-3 mb-4 text-xs text-brand-300 flex items-center gap-2">
                <Clock size={15} />
                <span>
                  Goes live in: <strong><Countdown endsAt={listing.publishAt} /></strong>
                </span>
              </div>
            )}

            {/* Leading Bidder Indicator */}
            <div className="flex items-center gap-2 mb-3 bg-surface-700/30 p-2.5 rounded-xl border border-white/5">
              <span className="text-xs text-slate-400">Leading Bidder:</span>
              {listing.winner ? (
                (user?._id && (listing.winner._id === user._id || listing.winner === user._id)) ? (
                  <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 text-xs font-700 flex items-center gap-1">
                    <CheckCircle size={11} /> You are leading
                  </span>
                ) : (
                  <span className="text-xs text-slate-200 font-600 flex items-center gap-1">
                    <User size={12} className="text-brand-400" />
                    @{typeof listing.winner === 'object' ? listing.winner.username : 'Active Bidder'}
                  </span>
                )
              ) : (
                <span className="text-xs text-slate-500 italic">No bids yet</span>
              )}
            </div>

            {/* Bidding panel (only when active and not seller) */}
            {isActive && !isSeller && (
              <div className="flex flex-col gap-3">
                {/* Switcher: Automatic Proxy Bid vs Instant Bid */}
                <div className="flex items-center gap-1 p-1 bg-surface-700/60 rounded-xl border border-white/5 text-xs font-600">
                  <button
                    id="tab-mode-proxy"
                    type="button"
                    onClick={() => setBidMode('proxy')}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      bidMode === 'proxy'
                        ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck size={13} />
                    <span>Auto Proxy Bid</span>
                  </button>
                  <button
                    id="tab-mode-manual"
                    type="button"
                    onClick={() => setBidMode('manual')}
                    className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      bidMode === 'manual'
                        ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Gavel size={13} />
                    <span>Instant Bid</span>
                  </button>
                </div>

                {bidMode === 'proxy' ? (
                  /* Automatic Proxy Bidding Form */
                  <div className="flex flex-col gap-2.5 bg-brand-500/5 border border-brand-500/20 rounded-xl p-3.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-700 text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                        <Lock size={12} className="text-brand-400" />
                        <span>Your Maximum Bid (₹)</span>
                      </label>
                      <span className="text-[11px] text-brand-300 font-600">
                        Min next: ₹{minBid?.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <input
                        id="proxy-max-input"
                        type="number"
                        min={minBid}
                        step={listing.minBidIncrement}
                        value={proxyAmount}
                        onChange={(e) => { setProxyAmount(e.target.value); setProxyError(''); }}
                        className="input text-sm font-600"
                        placeholder={`Min ₹${minBid}`}
                      />
                      <button
                        id="set-proxy-btn"
                        onClick={handleSetProxyBid}
                        disabled={settingProxy || !user}
                        className="btn btn-primary whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5"
                      >
                        <ShieldCheck size={15} />
                        {settingProxy ? 'Setting…' : proxyBid ? 'Update Max' : 'Set Maximum Bid'}
                      </button>
                    </div>

                    {proxyError && (
                      <p className="text-rose-400 text-xs flex items-center gap-1">
                        <AlertTriangle size={12} /> {proxyError}
                      </p>
                    )}

                    {/* Buyer Status & Commitment Feedback */}
                    {proxyBid && (
                      <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Your Private Maximum:</span>
                          <span className="font-700 text-slate-100 flex items-center gap-1">
                            <Lock size={11} className="text-brand-400" />
                            ₹{proxyBid.maxAmount?.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Current Status:</span>
                          {(user?._id && (listing.winner?._id === user._id || listing.winner === user._id)) ? (
                            <span className="badge bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 font-700 text-[11px] flex items-center gap-1">
                              <CheckCircle size={11} /> You're leading!
                            </span>
                          ) : (
                            <span className="badge bg-rose-400/15 text-rose-400 border border-rose-400/30 font-700 text-[11px] flex items-center gap-1">
                              <AlertTriangle size={11} /> You've been outbid
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 leading-relaxed bg-surface-800/40 p-2.5 rounded-lg border border-white/5">
                      CampusBid will automatically bid on your behalf when needed, up to your maximum amount.
                    </p>
                  </div>
                ) : (
                  /* Manual Bid Form */
                  <div>
                    <label className="text-xs font-600 text-slate-300 uppercase tracking-wider mb-1.5 block">
                      Your bid (min ₹{minBid?.toLocaleString()})
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="bid-amount-input"
                        type="number"
                        min={minBid}
                        step={listing.minBidIncrement}
                        value={bidAmount}
                        onChange={(e) => { setBidAmount(e.target.value); setBidError(''); }}
                        className="input"
                        placeholder={`Min ₹${minBid}`}
                      />
                      <button
                        id="place-bid-btn"
                        onClick={placeBid}
                        disabled={bidding || !user}
                        className="btn btn-primary whitespace-nowrap"
                      >
                        <Gavel size={16} />
                        {bidding ? 'Placing…' : 'Place Bid'}
                      </button>
                    </div>
                    {bidError && (
                      <p className="text-rose-400 text-xs mt-1.5 flex items-center gap-1">
                        <AlertTriangle size={12} /> {bidError}
                      </p>
                    )}
                  </div>
                )}

                {!user && (
                  <p className="text-slate-500 text-xs">
                    <Link to="/login" className="text-brand-400">Log in</Link> to place a bid
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  ⚡ Bidding in the last 30 seconds extends the auction by 30 s (max 10 times)
                </p>
              </div>
            )}

            {isSeller && isActive && (
              <div className="flex flex-col gap-2.5">
                <p className="text-slate-500 text-xs italic">You are the seller — you cannot bid on your own listing.</p>
                <Link
                  to={`/listings/${id}/edit`}
                  className="btn btn-secondary btn-sm w-full flex items-center justify-center gap-1.5 py-2 text-xs font-600 text-slate-200 hover:text-white"
                >
                  <Edit3 size={13} className="text-brand-400" /> Edit Product Details
                </Link>
              </div>
            )}

            {isScheduled && (
              <p className="text-slate-400 text-sm italic bg-surface-700/50 p-3 rounded-xl">
                Bidding is disabled while this listing is scheduled. It will open automatically when published.
              </p>
            )}

            {isCancelled && (
              <p className="text-rose-400/80 text-sm italic bg-surface-700/50 p-3 rounded-xl">
                This auction is cancelled. No further bids can be accepted.
              </p>
            )}

            {/* Handover & Exchange link for closed auctions */}
            {(listing.status === 'closed' || listing.status === 'completed') && (
              <div className="flex flex-col gap-2 mt-2">
                <Link to="/exchange" id="exchange-link"
                  className="btn btn-primary w-full flex items-center justify-center gap-2">
                  <Handshake size={16} /> Manage Product Exchange
                </Link>
                <Link to={`/handover/${id}`} id="handover-link"
                  className="btn btn-secondary w-full text-xs flex items-center justify-center gap-1">
                  <ChevronRight size={14} /> Legacy Handover View
                </Link>
              </div>
            )}
          </div>

          {/* Bid history */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-600 text-slate-200 flex items-center gap-2">
                <TrendingUp size={16} /> Bid history
              </h2>
              <span className="text-xs text-slate-500">{bids.length} bids</span>
            </div>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto" ref={bidListRef}>
              {bids.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No bids yet</p>
              ) : (
                bids.map((bid, i) => (
                  <div key={bid._id} className={`flex items-center justify-between p-2.5 rounded-xl ${i === 0 ? 'bg-brand-500/10 border border-brand-500/20' : 'bg-white/2'}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-brand-400 to-purple-500 flex items-center justify-center text-[10px] font-700 text-white">
                        {bid.bidder?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="text-sm text-slate-300">@{bid.bidder?.username}</span>
                      {bid.isLateBid && (
                        <span className="badge bg-gold-400/10 text-gold-400 text-[10px]">
                          <Zap size={9} /> Late
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`font-700 text-sm ${i === 0 ? 'text-brand-400' : 'text-slate-300'}`}>
                        ₹{bid.amount?.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  </div>

      {/* Confirmation Dialog for Cancellation */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} /> Cancel Listing
              </h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Are you sure you want to cancel <strong className="text-slate-100">"{listing.title}"</strong>?
            </p>

            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-xl leading-relaxed">
              ⚠️ <strong>Warning:</strong> This action cannot be undone. Once cancelled, the listing will be permanently removed from public auction and will not accept any bids.
            </div>

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Reason for cancellation (optional)
              </label>
              <input
                className="input text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Item damaged, wrong price, no longer available"
                maxLength={200}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="btn btn-secondary flex-1"
                disabled={cancelling}
              >
                Keep Listing
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="btn btn-danger flex-1 flex items-center justify-center gap-1.5"
              >
                {cancelling ? 'Cancelling…' : 'Yes, Cancel Listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Listing Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-rose-400">
                <Flag size={18} /> Report Listing
              </h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Report <strong className="text-slate-100">"{listing.title}"</strong> to administrators if it violates campus rules.
            </p>

            <form onSubmit={handleReportSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Report Reason
                </label>
                <select
                  className="input text-sm"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value)}
                >
                  <option value="inappropriate_content">Prohibited or Inappropriate Item</option>
                  <option value="counterfeit_item">Counterfeit / Fake Item</option>
                  <option value="misleading_information">Misleading or Inaccurate Description</option>
                  <option value="harassment">Harassment or Abusive Content</option>
                  <option value="shill_bidding">Suspected Shill Bidding / Manipulation</option>
                  <option value="spam">Spam or Unsolicited Promotion</option>
                  <option value="other">Other Campus Policy Violation</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Details / Evidence *
                </label>
                <textarea
                  className="input text-sm min-h-[90px] resize-none"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Explain why this listing should be reviewed by administrators..."
                  maxLength={500}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={submittingReport}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport || !reportDescription.trim()}
                  className="btn btn-danger flex-1 flex items-center justify-center gap-1.5"
                >
                  {submittingReport ? 'Submitting…' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
