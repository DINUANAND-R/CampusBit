import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { listingsApi, bidsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import Countdown from '../../components/Countdown';
import toast from 'react-hot-toast';
import {
  Gavel, TrendingUp, User, Clock, ChevronRight,
  Zap, AlertTriangle, CheckCircle, XCircle, Package, Edit3, Image as ImageIcon
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';

const conditionBadge = {
  new:        'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
  'like-new': 'bg-brand-400/10   text-brand-400   border-brand-400/20',
  good:       'bg-gold-400/10    text-gold-400    border-gold-400/20',
  fair:       'bg-slate-400/10   text-slate-400   border-slate-400/20',
};

export default function ListingDetailPage() {
  const { id } = useParams();
  const { user }   = useAuth();
  const { socket } = useSocket();
  const navigate   = useNavigate();

  const [listing, setListing] = useState(null);
  const [bids, setBids]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding]     = useState(false);
  const [bidError, setBidError]   = useState('');
  const [imgIdx, setImgIdx]       = useState(0);
  const [extended, setExtended]   = useState(false);
  const bidListRef = useRef(null);

  // Load listing + bid history
  const load = useCallback(async () => {
    try {
      const [{ data: ld }, { data: bd }] = await Promise.all([
        listingsApi.getOne(id),
        bidsApi.history(id),
      ]);
      setListing(ld.listing);
      setBids(bd.bids);
      setBidAmount(String((ld.listing.currentPrice + ld.listing.minBidIncrement) || ''));
    } catch {
      toast.error('Listing not found');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

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
      // flash
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

    const onError = ({ message }) => toast.error(message);

    socket.on('auction:bid_update', onBidUpdate);
    socket.on('auction:extended',   onExtended);
    socket.on('auction:closed',     onClosed);
    socket.on('auction:error',      onError);

    return () => {
      socket.emit('auction:leave', id);
      socket.off('auction:bid_update', onBidUpdate);
      socket.off('auction:extended',   onExtended);
      socket.off('auction:closed',     onClosed);
      socket.off('auction:error',      onError);
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
    } catch (err) {
      const msg = err.response?.data?.message || 'Bid failed';
      setBidError(msg);
      toast.error(msg);
    } finally {
      setBidding(false);
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
  const isSeller = user?._id === listing.seller?._id;
  const minBid   = listing.currentPrice + listing.minBidIncrement;
  const images   = listing.images?.length ? listing.images : [];

  const categoryEmoji = { books:'📚',electronics:'💻',clothing:'👕',furniture:'🛋️',sports:'⚽',other:'📦' };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Extension banner */}
      {extended && (
        <div className="mb-6 flex items-center gap-3 bg-gold-400/10 border border-gold-400/30 text-gold-400 rounded-xl px-4 py-3 text-sm font-600 animate-pulse">
          <Zap size={18} /> Auction extended — a bid was placed in the last 30 seconds!
        </div>
      )}

      {/* Status banner */}
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
          {/* Main Image viewer */}
          <div className="glass rounded-2xl overflow-hidden h-72 sm:h-96 flex items-center justify-center relative bg-surface-800">
            {images.length > 0 ? (
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
                images.length > 0 ? 'hidden' : 'flex'
              }`}
            >
              {categoryEmoji[listing.category] || '📦'}
            </div>
          </div>

          {/* Thumbnails row */}
          {images.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => {
                const src = getImageUrl(img);
                const isSelected = i === imgIdx;
                return (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
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
            </div>
          )}

          {/* Details */}
          <div className="glass rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <h1 className="font-display font-700 text-2xl text-slate-100 leading-snug">{listing.title}</h1>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge border ${conditionBadge[listing.condition]}`}>{listing.condition}</span>
                {isSeller && isActive && bids.length === 0 && (
                  <Link
                    to={`/listings/${id}/edit`}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 py-1 px-2.5 text-xs"
                  >
                    <Edit3 size={12} /> Edit
                  </Link>
                )}
              </div>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{listing.description}</p>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <User size={14} />
              <span>Sold by <span className="text-slate-200 font-600">@{listing.seller?.username}</span></span>
              {listing.seller?.campusId && <span>· Campus ID: {listing.seller.campusId}</span>}
            </div>
          </div>
        </div>

        {/* Right — bid panel */}
        <div className="flex flex-col gap-4">
          {/* Price + timer */}
          <div className="glass rounded-2xl p-6">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Current price</p>
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

            {/* Bid input */}
            {isActive && !isSeller && (
              <div className="flex flex-col gap-3">
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
              <p className="text-slate-500 text-sm italic">You are the seller — you cannot bid on your own listing.</p>
            )}

            {/* Handover link for closed auctions */}
            {(listing.status === 'closed' || listing.status === 'completed') && (
              <Link to={`/handover/${id}`} id="handover-link"
                className="btn btn-primary w-full mt-2">
                <ChevronRight size={16} /> View Handover Status
              </Link>
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
                <p className="text-slate-500 text-sm text-center py-4">No bids yet — be the first!</p>
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
        </div>
      </div>
    </div>
  );
}
