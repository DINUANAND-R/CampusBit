import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listingsApi } from '../../api';
import ListingCard from '../../components/ListingCard';
import { Search, SlidersHorizontal, Gavel, Sparkles } from 'lucide-react';

const CATEGORIES = ['all', 'books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];
const SORTS = [
  { value: 'endsAt',     label: 'Ending soon' },
  { value: 'newest',     label: 'Newest' },
  { value: 'price_asc',  label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
];

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const q        = params.get('q') || '';
  const category = params.get('category') || '';
  const sort     = params.get('sort') || 'endsAt';

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await listingsApi.getAll({
        q: q || undefined,
        category: category || undefined,
        sort,
        page,
        limit: 12,
      });
      setListings(data.listings);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [q, category, sort, page]);

  useEffect(() => { fetchListings(); }, [fetchListings]);
  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [q, category, sort]);

  const setFilter = (key, val) => {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val); else next.delete(key);
    setParams(next);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero banner */}
      <div className="relative rounded-3xl overflow-hidden mb-10 p-10 text-center"
        style={{ background: 'linear-gradient(135deg, #1a1d30 0%, #131626 100%)' }}>
        <div className="absolute inset-0 bg-gradient-to-r from-brand-600/20 via-purple-600/10 to-brand-600/20" />
        <div className="relative z-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles size={18} className="text-gold-400" />
            <span className="text-gold-400 text-sm font-600 uppercase tracking-widest">Live Auctions</span>
            <Sparkles size={18} className="text-gold-400" />
          </div>
          <h1 className="font-display font-800 text-5xl mb-3 gradient-text">CampusBid</h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Find great deals from students on your campus. Real-time bidding, real items.
          </p>
          {total > 0 && (
            <p className="mt-4 text-brand-400 font-600">
              {total} active auction{total !== 1 ? 's' : ''} right now
            </p>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Category pills */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              id={`filter-${cat}`}
              onClick={() => setFilter('category', cat === 'all' ? '' : cat)}
              className={`btn btn-sm capitalize ${
                (cat === 'all' ? !category : category === cat)
                  ? 'btn-primary'
                  : 'btn-secondary'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-400" />
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => setFilter('sort', e.target.value)}
            className="input py-2 text-sm w-40"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Search bar (standalone row if q is set) */}
      {q && (
        <div className="mb-6 flex items-center gap-2 text-slate-400 text-sm">
          <Search size={14} />
          Showing results for <strong className="text-slate-200">"{q}"</strong>
          <button onClick={() => setFilter('q', '')} className="text-brand-400 hover:text-brand-300 ml-1">
            Clear
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl h-72 animate-pulse" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20">
          <Gavel size={48} className="text-slate-600 mx-auto mb-4" />
          <h2 className="text-slate-400 text-xl font-600 mb-2">No auctions found</h2>
          <p className="text-slate-500 text-sm">Try a different category or be the first to list something!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {listings.map((l) => <ListingCard key={l._id} listing={l} />)}
        </div>
      )}

      {/* Pagination */}
      {total > 12 && (
        <div className="flex justify-center gap-3 mt-10">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn btn-secondary btn-sm">
            ← Prev
          </button>
          <span className="text-slate-400 text-sm flex items-center">Page {page}</span>
          <button disabled={listings.length < 12} onClick={() => setPage(p => p + 1)} className="btn btn-secondary btn-sm">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
