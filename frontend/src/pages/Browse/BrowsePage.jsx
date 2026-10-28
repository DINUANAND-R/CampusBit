import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { listingsApi } from '../../api';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import ListingCard from '../../components/ListingCard';
import {
  Search,
  SlidersHorizontal,
  Gavel,
  Sparkles,
  BookOpen,
  Laptop,
  Shirt,
  Armchair,
  Dumbbell,
  Package,
  Layers,
  ArrowRight,
  Plus,
  X,
  TrendingUp,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Items', icon: Layers },
  { id: 'books', label: 'Textbooks', icon: BookOpen },
  { id: 'electronics', label: 'Electronics', icon: Laptop },
  { id: 'clothing', label: 'Apparel', icon: Shirt },
  { id: 'furniture', label: 'Dorm Gear', icon: Armchair },
  { id: 'sports', label: 'Sports & Cycles', icon: Dumbbell },
  { id: 'other', label: 'Other', icon: Package },
];

const SORTS = [
  { value: 'endsAt', label: 'Ending soon' },
  { value: 'newest', label: 'Recently listed' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'endsAt';

  const fetchListings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { data } = await listingsApi.getAll({
          q: q || undefined,
          category: category || undefined,
          sort,
          page,
          limit: 12,
        });
        setListings(data.listings || []);
        setTotal(data.total || 0);
      } catch (err) {
        console.error('[BrowsePage] Fetch listings error:', err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [q, category, sort, page]
  );

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    setPage(1);
  }, [q, category, sort]);

  // Real-time Socket.IO synchronization for active marketplace
  useEffect(() => {
    if (!socket) return;

    const handleBidUpdate = (data) => {
      setListings((prev) =>
        prev.map((l) =>
          l._id === data.listingId
            ? { ...l, currentPrice: data.amount, endsAt: data.endsAt || l.endsAt }
            : l
        )
      );
    };

    const handleExtended = (data) => {
      setListings((prev) =>
        prev.map((l) =>
          l._id === data.listingId ? { ...l, endsAt: data.newEndsAt } : l
        )
      );
    };

    const handlePublished = (data) => {
      if (page === 1 && !q) {
        if (!category || category === 'all' || category === data.category) {
          fetchListings(true);
        }
      }
    };

    const handleClosedOrCancelled = (data) => {
      setListings((prev) => prev.filter((l) => l._id !== data.listingId));
      setTotal((prev) => Math.max(0, prev - 1));
    };

    const handleReconnect = () => {
      fetchListings(true);
    };

    socket.on('auction:bid_update', handleBidUpdate);
    socket.on('auction:extended', handleExtended);
    socket.on('auction:published', handlePublished);
    socket.on('auction:status_change', handlePublished);
    socket.on('auction:closed', handleClosedOrCancelled);
    socket.on('auction:cancelled', handleClosedOrCancelled);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('auction:bid_update', handleBidUpdate);
      socket.off('auction:extended', handleExtended);
      socket.off('auction:published', handlePublished);
      socket.off('auction:status_change', handlePublished);
      socket.off('auction:closed', handleClosedOrCancelled);
      socket.off('auction:cancelled', handleClosedOrCancelled);
      socket.off('connect', handleReconnect);
    };
  }, [socket, page, q, category, fetchListings]);

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    setParams(next);
  };

  const clearAllFilters = () => {
    setParams(new URLSearchParams());
  };

  const activeCategory = category || 'all';

  return (
    <div className="min-h-screen bg-[#101211] text-[#F4F5F0]">
      {/* ── Compact Editorial Hero ─────────────────────────────────────────── */}
      <section className="border-b border-[#30372F] bg-[#151815]/60 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-10 sm:py-14 relative z-10">
          <div className="max-w-3xl">
            {/* Live Pill Indicator */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1B201B] border border-[#30372F] text-xs font-500 text-[#A1A79E] mb-4">
              <span className="live-dot w-2 h-2 rounded-full bg-[#C6FF4D]" />
              <span>Campus Resale Marketplace</span>
              {total > 0 && (
                <>
                  <span className="text-[#30372F]">•</span>
                  <span className="text-[#C6FF4D] font-600 tabular-nums">
                    {total} active {total === 1 ? 'auction' : 'auctions'}
                  </span>
                </>
              )}
            </div>

            {/* Headline */}
            <h1 className="font-display font-800 text-3xl sm:text-5xl text-[#F4F5F0] tracking-tight leading-[1.15] mb-3">
              Buy and sell essentials within{' '}
              <span className="text-[#C6FF4D]">your campus</span>.
            </h1>

            <p className="text-[#A1A79E] text-sm sm:text-base max-w-xl leading-relaxed mb-6">
              Verified university auctions for textbooks, cycles, electronics, and dorm gear with transparent bidding and physical campus handovers.
            </p>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="#marketplace-feed"
                className="btn btn-primary btn-sm py-2 px-4 text-xs font-700 flex items-center gap-1.5"
              >
                <span>Explore Listings</span>
                <ArrowRight size={13} />
              </a>

              {user ? (
                <Link
                  to="/listings/new"
                  className="btn btn-secondary btn-sm py-2 px-4 text-xs font-600 flex items-center gap-1.5 text-[#F4F5F0]"
                >
                  <Plus size={13} className="text-[#C6FF4D]" />
                  <span>Sell an Item</span>
                </Link>
              ) : (
                <Link
                  to="/register"
                  className="btn btn-secondary btn-sm py-2 px-4 text-xs font-600 flex items-center gap-1.5 text-[#F4F5F0]"
                >
                  <span>Join Free with Campus ID</span>
                </Link>
              )}

              <Link
                to="/assistant"
                className="btn btn-secondary btn-sm py-2 px-3.5 text-xs text-[#A1A79E] hover:text-[#C6FF4D] flex items-center gap-1.5"
              >
                <Sparkles size={13} className="text-[#C6FF4D]" />
                <span>AI Assistant Search</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Category Bar ───────────────────────────────────────────────────── */}
      <section className="border-b border-[#30372F] bg-[#101211] sticky top-[53px] z-30">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                id={`filter-${cat.id}`}
                onClick={() => setFilter('category', cat.id === 'all' ? '' : cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-[#C6FF4D] text-[#101211] shadow-sm'
                    : 'bg-[#1B201B] text-[#A1A79E] hover:text-[#F4F5F0] border border-[#30372F] hover:border-[#30372F]'
                }`}
              >
                <Icon size={13} className={isSelected ? 'text-[#101211]' : 'text-[#747D72]'} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Marketplace Feed Section ────────────────────────────────────────── */}
      <main id="marketplace-feed" className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls Bar: Results Count & Sort Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[#30372F]">
          <div className="flex items-center gap-2 text-xs text-[#A1A79E]">
            <span className="font-600 text-[#F4F5F0]">
              {total} {total === 1 ? 'Product' : 'Products'} Listed
            </span>
            {category && category !== 'all' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B201B] border border-[#30372F] text-[11px] text-[#C6FF4D] capitalize">
                {category}
                <button
                  type="button"
                  onClick={() => setFilter('category', '')}
                  className="hover:text-white"
                >
                  <X size={10} />
                </button>
              </span>
            )}
            {q && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#1B201B] border border-[#30372F] text-[11px] text-[#F4F5F0]">
                Search: "{q}"
                <button
                  type="button"
                  onClick={() => setFilter('q', '')}
                  className="hover:text-[#FF7373]"
                >
                  <X size={10} />
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#747D72] hidden sm:inline">Sort:</span>
            <div className="relative">
              <select
                id="sort-select"
                value={sort}
                onChange={(e) => setFilter('sort', e.target.value)}
                className="bg-[#151815] border border-[#30372F] text-[#F4F5F0] text-xs py-1.5 pl-3 pr-8 rounded-lg outline-none focus:border-[#C6FF4D] cursor-pointer appearance-none"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#1B201B] text-[#F4F5F0]">
                    {s.label}
                  </option>
                ))}
              </select>
              <SlidersHorizontal
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#747D72] pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Product Cards Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-[#1B201B] border border-[#30372F] rounded-xl overflow-hidden p-3.5 space-y-3"
              >
                <div className="aspect-[4/3] w-full rounded-lg skeleton-shimmer" />
                <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                <div className="h-3 w-1/2 rounded skeleton-shimmer" />
                <div className="h-6 w-1/3 rounded skeleton-shimmer pt-1" />
              </div>
            ))}
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 bg-[#151815]/50 border border-[#30372F] rounded-2xl p-8 max-w-xl mx-auto my-8">
            <div className="w-12 h-12 rounded-xl bg-[#1B201B] border border-[#30372F] flex items-center justify-center mx-auto mb-4">
              <Gavel size={22} className="text-[#747D72]" />
            </div>
            <h2 className="text-[#F4F5F0] text-lg font-display font-700 mb-1">
              No matching campus auctions
            </h2>
            <p className="text-[#A1A79E] text-xs max-w-sm mx-auto mb-6">
              Try adjusting your search terms, removing filters, or be the first to list an item in this category.
            </p>
            <div className="flex items-center justify-center gap-2">
              {(q || (category && category !== 'all')) && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  Clear All Filters
                </button>
              )}
              {user && (
                <Link to="/listings/new" className="btn btn-primary btn-sm text-xs font-700">
                  <Plus size={13} /> List an Item
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
            {listings.map((l) => (
              <ListingCard key={l._id} listing={l} />
            ))}
          </div>
        )}

        {/* Pagination Controls */}
        {total > 12 && (
          <div className="flex items-center justify-center gap-3 mt-12 pt-6 border-t border-[#30372F]">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="btn btn-secondary btn-sm py-1.5 px-3.5 text-xs disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-xs text-[#A1A79E] font-500 tabular-nums">
              Page {page} of {Math.ceil(total / 12)}
            </span>
            <button
              disabled={listings.length < 12 || page >= Math.ceil(total / 12)}
              onClick={() => setPage((p) => p + 1)}
              className="btn btn-secondary btn-sm py-1.5 px-3.5 text-xs disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
