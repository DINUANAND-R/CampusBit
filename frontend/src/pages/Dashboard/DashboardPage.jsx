import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listingsApi, bidsApi } from '../../api';
import Countdown from '../../components/Countdown';
import toast from 'react-hot-toast';
import {
  Gavel, Package, TrendingUp, ChevronRight, Plus,
  Edit3, Trash2, Calendar, Clock, AlertTriangle, X, Check
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';

const statusColor = {
  active:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  scheduled: 'text-brand-400   bg-brand-400/10   border-brand-400/20',
  cancelled: 'text-rose-400    bg-rose-400/10    border-rose-400/20',
  closed:    'text-indigo-400  bg-indigo-400/10  border-indigo-400/20',
  unsold:    'text-slate-400   bg-slate-400/10   border-slate-400/20',
  completed: 'text-gold-400    bg-gold-400/10    border-gold-400/20',
  draft:     'text-slate-500   bg-slate-500/10   border-slate-500/20',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [myListings, setMyListings] = useState([]);
  const [myBids,     setMyBids]     = useState([]);
  const [tab,        setTab]        = useState('listings'); // 'listings' | 'bids'
  const [listingFilter, setListingFilter] = useState('all'); // 'all' | 'active' | 'scheduled' | 'closed' | 'cancelled'
  const [loading,    setLoading]    = useState(true);

  // Cancellation modal state
  const [targetListing, setTargetListing] = useState(null);
  const [cancelReason,  setCancelReason]  = useState('');
  const [cancelling,    setCancelling]    = useState(false);

  const fetchData = async () => {
    try {
      const [{ data: ld }, { data: bd }] = await Promise.all([
        listingsApi.myListings(),
        bidsApi.myBids(),
      ]);
      setMyListings(ld.listings || []);
      setMyBids(bd.bids || []);
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConfirmCancel = async () => {
    if (!targetListing) return;
    setCancelling(true);
    try {
      const { data } = await listingsApi.cancel(targetListing._id, cancelReason);
      toast.success('Listing cancelled successfully');
      // Update state in place without full page refresh
      setMyListings((prev) =>
        prev.map((l) => (l._id === targetListing._id ? { ...l, ...data.listing } : l))
      );
      setTargetListing(null);
      setCancelReason('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel listing');
    } finally {
      setCancelling(false);
    }
  };

  // Filter listings based on status sub-tab
  const filteredListings = myListings.filter((l) => {
    if (listingFilter === 'all') return true;
    if (listingFilter === 'active') return l.status === 'active';
    if (listingFilter === 'scheduled') return l.status === 'scheduled';
    if (listingFilter === 'cancelled') return l.status === 'cancelled';
    if (listingFilter === 'closed') return l.status === 'closed' || l.status === 'completed' || l.status === 'unsold';
    return true;
  });

  const countByStatus = {
    all: myListings.length,
    active: myListings.filter((l) => l.status === 'active').length,
    scheduled: myListings.filter((l) => l.status === 'scheduled').length,
    cancelled: myListings.filter((l) => l.status === 'cancelled').length,
    closed: myListings.filter((l) => l.status === 'closed' || l.status === 'completed' || l.status === 'unsold').length,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-700 text-3xl text-slate-100 mb-1">Seller Dashboard</h1>
          <p className="text-slate-400">Welcome back, <span className="text-brand-400 font-600">@{user?.username}</span></p>
        </div>
        <Link to="/listings/new" className="btn btn-primary">
          <Plus size={16} /> New Listing
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Active auctions', value: countByStatus.active, icon: Gavel, color: 'emerald' },
          { label: 'Scheduled', value: countByStatus.scheduled, icon: Calendar, color: 'brand' },
          { label: 'Total listings', value: countByStatus.all, icon: Package, color: 'purple' },
          { label: 'Bids placed', value: myBids.length, icon: TrendingUp, color: 'gold' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-4 text-center">
            <Icon size={20} className={`text-${color}-400 mx-auto mb-1.5`} />
            <p className="font-display font-700 text-2xl text-slate-100">{value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 mb-6 border-b border-surface-600 pb-4">
        {['listings', 'bids'].map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            onClick={() => setTab(t)}
            className={`btn btn-sm capitalize ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t === 'listings' ? '📦 My Listings' : '🔨 My Bids'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map(i => <div key={i} className="glass rounded-xl h-20 animate-pulse" />)}
        </div>
      ) : tab === 'listings' ? (
        <div className="flex flex-col gap-4">
          {/* Status Sub-Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all',       label: 'All' },
              { id: 'active',    label: 'Active' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'closed',    label: 'Closed' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map(({ id, label }) => (
              <button
                key={id}
                id={`filter-${id}`}
                onClick={() => setListingFilter(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-all flex items-center gap-1.5 ${
                  listingFilter === id
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-surface-700/60 text-slate-400 hover:text-slate-200 hover:bg-surface-700'
                }`}
              >
                <span>{label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  listingFilter === id ? 'bg-black/30 text-white' : 'bg-surface-800 text-slate-500'
                }`}>
                  {countByStatus[id] || 0}
                </span>
              </button>
            ))}
          </div>

          {filteredListings.length === 0 ? (
            <div className="text-center py-12 text-slate-400 glass rounded-2xl">
              <Package size={40} className="mx-auto mb-3 text-slate-600" />
              <p className="text-sm">No listings found in this section.</p>
              <Link to="/listings/new" className="text-brand-400 text-xs mt-2 inline-block">
                Create an auction listing →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredListings.map((l) => {
                const thumb = getImageUrl(l.images?.[0]);
                const isScheduled = l.status === 'scheduled';
                const isActive = l.status === 'active';
                const isCancelled = l.status === 'cancelled';
                const bidCount = l.bidCount || 0;
                const canCancel = isScheduled || (isActive && bidCount === 0);

                return (
                  <div
                    key={l._id}
                    id={`my-listing-${l._id}`}
                    className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 card-hover"
                  >
                    {/* Left: Thumbnail & Main Info */}
                    <Link
                      to={`/listings/${l._id}`}
                      className="flex items-center gap-3.5 min-w-0 flex-1 group"
                    >
                      <div className="w-14 h-14 rounded-xl bg-surface-700 flex items-center justify-center text-xl shrink-0 overflow-hidden border border-white/5">
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          '📦'
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-600 text-slate-200 truncate group-hover:text-brand-300 transition-colors">
                          {l.title}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span className="font-700 text-slate-100">
                            ₹{l.currentPrice?.toLocaleString()}
                          </span>
                          <span>&bull;</span>
                          <span>{bidCount} {bidCount === 1 ? 'bid' : 'bids'}</span>
                          {isScheduled && l.publishAt && (
                            <>
                              <span>&bull;</span>
                              <span className="text-brand-400 flex items-center gap-1">
                                <Calendar size={11} />
                                Goes live: {new Date(l.publishAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          )}
                          {isCancelled && l.cancellationReason && (
                            <>
                              <span>&bull;</span>
                              <span className="text-rose-400 truncate max-w-xs">
                                Reason: {l.cancellationReason}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Right: Status badge & Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-surface-600/50">
                      {isActive && (
                        <div className="text-right hidden md:block">
                          <p className="text-[10px] text-slate-400">Ends in</p>
                          <Countdown endsAt={l.endsAt} className="text-xs" />
                        </div>
                      )}

                      {isScheduled && (
                        <div className="text-right hidden md:block">
                          <p className="text-[10px] text-brand-400">Publishes in</p>
                          <Countdown endsAt={l.publishAt} className="text-xs text-brand-300" />
                        </div>
                      )}

                      <span className={`badge border ${statusColor[l.status] || ''}`}>
                        {l.status}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        {/* Edit schedule or listing */}
                        {(isScheduled || (isActive && bidCount === 0)) && (
                          <Link
                            to={`/listings/${l._id}/edit`}
                            className="btn btn-secondary btn-sm py-1.5 px-2.5 text-xs flex items-center gap-1"
                            title={isScheduled ? 'Reschedule publication' : 'Edit listing'}
                          >
                            <Edit3 size={13} />
                            <span>{isScheduled ? 'Reschedule' : 'Edit'}</span>
                          </Link>
                        )}

                        {/* Cancel button */}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => setTargetListing(l)}
                            className="btn btn-danger btn-sm py-1.5 px-2.5 text-xs flex items-center gap-1"
                            title="Cancel this listing"
                          >
                            <Trash2 size={13} />
                            <span>Cancel</span>
                          </button>
                        )}

                        {/* Active with bids info indicator */}
                        {isActive && bidCount > 0 && (
                          <span
                            className="text-[11px] text-slate-500 bg-surface-700/60 px-2 py-1 rounded"
                            title="Auction cannot be cancelled once bidding starts"
                          >
                            Locked
                          </span>
                        )}

                        {/* Handover link */}
                        {(l.status === 'closed' || l.status === 'completed') && (
                          <Link
                            to={`/handover/${l._id}`}
                            className="btn btn-primary btn-sm py-1.5 px-2.5 text-xs flex items-center gap-1"
                          >
                            <span>Handover</span>
                            <ChevronRight size={12} />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* My Bids Tab */
        <div className="flex flex-col gap-3">
          {myBids.length === 0 ? (
            <div className="text-center py-12 text-slate-400 glass rounded-2xl">
              <Gavel size={40} className="mx-auto mb-3 text-slate-600" />
              <p>No bids placed yet.</p>
              <Link to="/" className="text-brand-400 text-xs mt-2 inline-block">Browse active auctions →</Link>
            </div>
          ) : myBids.map((bid) => (
            <Link
              key={bid._id}
              to={`/listings/${bid.listing?._id}`}
              id={`my-bid-${bid._id}`}
              className="glass rounded-xl p-4 flex items-center gap-4 card-hover"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-700 flex items-center justify-center text-xl shrink-0">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-slate-200 truncate">{bid.listing?.title || 'Unknown listing'}</p>
                <p className="text-xs text-slate-400">Seller: @{bid.listing?.seller?.username}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-700 gradient-text">₹{bid.amount?.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500">{new Date(bid.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`badge border ${statusColor[bid.listing?.status] || ''}`}>
                {bid.listing?.status || '?'}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Confirmation Modal for Listing Cancellation */}
      {targetListing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} /> Cancel Listing
              </h3>
              <button
                onClick={() => setTargetListing(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Are you sure you want to cancel <strong className="text-slate-100">"{targetListing.title}"</strong>?
            </p>

            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-xl leading-relaxed">
              ⚠️ <strong>Warning:</strong> This cannot be undone. The listing will immediately be stopped and will not accept any bids.
            </div>

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Reason for cancellation (optional)
              </label>
              <input
                className="input text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Item damaged, scheduling conflict, etc."
                maxLength={200}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTargetListing(null)}
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
    </div>
  );
}
