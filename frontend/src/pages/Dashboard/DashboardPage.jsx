import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { listingsApi, bidsApi } from '../../api';
import Countdown from '../../components/Countdown';
import { Gavel, Package, TrendingUp, ChevronRight, Plus, Edit3 } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';

const statusColor = {
  active:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  closed:    'text-brand-400  bg-brand-400/10  border-brand-400/20',
  unsold:    'text-slate-400  bg-slate-400/10  border-slate-400/20',
  completed: 'text-gold-400   bg-gold-400/10   border-gold-400/20',
  draft:     'text-slate-500  bg-slate-500/10  border-slate-500/20',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [myListings, setMyListings] = useState([]);
  const [myBids,     setMyBids]     = useState([]);
  const [tab,        setTab]        = useState('listings');
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    Promise.all([listingsApi.myListings(), bidsApi.myBids()])
      .then(([{ data: ld }, { data: bd }]) => {
        setMyListings(ld.listings);
        setMyBids(bd.bids);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-700 text-3xl text-slate-100 mb-1">Dashboard</h1>
          <p className="text-slate-400">Welcome back, <span className="text-brand-400 font-600">@{user?.username}</span></p>
        </div>
        <Link to="/listings/new" className="btn btn-primary">
          <Plus size={16} /> New Listing
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'My listings', value: myListings.length, icon: Package, color: 'brand' },
          { label: 'Active auctions', value: myListings.filter(l => l.status === 'active').length, icon: Gavel, color: 'emerald' },
          { label: 'Bids placed', value: myBids.length, icon: TrendingUp, color: 'gold' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass rounded-2xl p-5 text-center">
            <Icon size={22} className={`text-${color}-400 mx-auto mb-2`} />
            <p className="font-display font-700 text-2xl text-slate-100">{value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
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
          {[1,2,3].map(i => <div key={i} className="glass rounded-xl h-16 animate-pulse" />)}
        </div>
      ) : tab === 'listings' ? (
        <div className="flex flex-col gap-3">
          {myListings.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Package size={40} className="mx-auto mb-3 text-slate-600" />
              <p>No listings yet. <Link to="/listings/new" className="text-brand-400">Create your first →</Link></p>
            </div>
          ) : myListings.map((l) => {
            const thumb = getImageUrl(l.images?.[0]);
            const canEdit = l.status === 'active' && l.currentPrice === l.startingPrice;
            return (
              <Link key={l._id} to={`/listings/${l._id}`} id={`my-listing-${l._id}`}
                className="glass rounded-xl p-4 flex items-center gap-4 card-hover">
                <div className="w-12 h-12 rounded-xl bg-surface-700 flex items-center justify-center text-xl shrink-0 overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    '📦'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-600 text-slate-200 truncate">{l.title}</p>
                  <p className="text-sm text-slate-400">₹{l.currentPrice?.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {l.status === 'active' && <Countdown endsAt={l.endsAt} className="text-xs" />}
                  <span className={`badge border ${statusColor[l.status]}`}>{l.status}</span>
                  {canEdit && (
                    <Link
                      to={`/listings/${l._id}/edit`}
                      onClick={(e) => e.stopPropagation()}
                      className="btn btn-secondary btn-sm flex items-center gap-1"
                    >
                      <Edit3 size={13} /> Edit
                    </Link>
                  )}
                  {(l.status === 'closed' || l.status === 'completed') && (
                    <Link to={`/handover/${l._id}`} onClick={(e) => e.stopPropagation()}
                      className="btn btn-secondary btn-sm">
                      Handover <ChevronRight size={13} />
                    </Link>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {myBids.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Gavel size={40} className="mx-auto mb-3 text-slate-600" />
              <p>No bids yet. <Link to="/" className="text-brand-400">Browse auctions →</Link></p>
            </div>
          ) : myBids.map((bid) => (
            <Link key={bid._id} to={`/listings/${bid.listing?._id}`} id={`my-bid-${bid._id}`}
              className="glass rounded-xl p-4 flex items-center gap-4 card-hover">
              <div className="w-12 h-12 rounded-xl bg-surface-700 flex items-center justify-center text-xl shrink-0">
                📦
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-600 text-slate-200 truncate">{bid.listing?.title || 'Unknown listing'}</p>
                <p className="text-xs text-slate-400">by @{bid.listing?.seller?.username}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-700 gradient-text">₹{bid.amount?.toLocaleString()}</p>
                <p className="text-xs text-slate-500">{new Date(bid.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`badge border ${statusColor[bid.listing?.status] || ''}`}>
                {bid.listing?.status || '?'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
