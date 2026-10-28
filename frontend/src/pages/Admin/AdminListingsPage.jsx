import React, { useEffect, useState } from 'react';
import { adminApi, bidsApi } from '../../api';
import { getImageUrl } from '../../utils/imageUrl';
import {
  Package,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Gavel,
  CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminListingsPage() {
  const [listings, setListings] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [moderatedFilter, setModeratedFilter] = useState('all');
  const [sort, setSort] = useState('createdAt_desc');

  // Inspection modal
  const [inspectListing, setInspectListing] = useState(null);
  const [inspectBids, setInspectBids] = useState([]);
  const [loadingBids, setLoadingBids] = useState(false);

  // Moderate action modal
  const [moderateTarget, setModerateTarget] = useState(null);
  const [moderateAction, setModerateAction] = useState('hide'); // 'hide' | 'restore'
  const [moderateReason, setModerateReason] = useState('');
  const [submittingModeration, setSubmittingModeration] = useState(false);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search: search.trim() || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        isModerated: moderatedFilter === 'moderated' ? 'true' : moderatedFilter === 'unmoderated' ? 'false' : undefined,
        sort,
      };
      const { data } = await adminApi.getListings(params);
      setListings(data.listings || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      toast.error('Failed to load listings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [page, statusFilter, categoryFilter, moderatedFilter, sort]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchListings();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const handleInspect = async (l) => {
    setInspectListing(l);
    setLoadingBids(true);
    try {
      const { data } = await bidsApi.history(l._id);
      setInspectBids(data.bids || []);
    } catch (err) {
      toast.error('Failed to load bid history');
    } finally {
      setLoadingBids(false);
    }
  };

  const handleModerateSubmit = async (e) => {
    e.preventDefault();
    if (moderateAction === 'hide' && !moderateReason.trim()) {
      toast.error('A moderation reason is required to hide a listing.');
      return;
    }

    setSubmittingModeration(true);
    try {
      await adminApi.moderateListing(moderateTarget._id, {
        action: moderateAction,
        reason: moderateReason.trim(),
      });
      toast.success(
        moderateAction === 'hide'
          ? 'Listing has been hidden from public auction feeds.'
          : 'Listing has been restored.'
      );
      setModerateTarget(null);
      setModerateReason('');
      fetchListings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to moderate listing');
    } finally {
      setSubmittingModeration(false);
    }
  };

  const categories = ['books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h1 className="font-display font-800 text-xl text-slate-100 flex items-center gap-2">
            <Package className="text-purple-400" size={22} /> Listing & Auction Management
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Monitor all campus auctions, audit bid histories, and take controlled moderation actions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, ID…"
              className="input pl-8 py-1.5 text-xs w-48 sm:w-56"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2 text-xs w-28"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="closed">Closed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2 text-xs w-28 capitalize"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Moderated filter */}
          <select
            value={moderatedFilter}
            onChange={(e) => { setModeratedFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2 text-xs w-32"
          >
            <option value="all">Moderation</option>
            <option value="unmoderated">Normal (Safe)</option>
            <option value="moderated">Hidden (Flagged)</option>
          </select>
        </div>
      </div>

      {/* Listings Table */}
      <div className="glass rounded-2xl p-5 border border-white/8 flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-800/80 uppercase tracking-wider text-[10px] text-slate-400 border-b border-white/5">
              <tr>
                <th className="py-3 px-3">Listing Item</th>
                <th className="py-3 px-3">Seller</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Starting</th>
                <th className="py-3 px-3">Leading / Final</th>
                <th className="py-3 px-3">Bids</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Moderated</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Loading auction catalog…
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    No listings found matching criteria.
                  </td>
                </tr>
              ) : (
                listings.map((l) => {
                  const thumb = getImageUrl(l.images?.[0]);

                  return (
                    <tr key={l._id} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 px-3 flex items-center gap-2.5 min-w-[200px]">
                        <div className="w-10 h-10 rounded-lg bg-surface-700 shrink-0 overflow-hidden border border-white/5 flex items-center justify-center">
                          {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : '📦'}
                        </div>
                        <div className="truncate">
                          <p className="font-600 text-slate-200 truncate max-w-[180px]">{l.title}</p>
                          <p className="text-[10px] text-slate-500">ID: {l._id.slice(-6)}</p>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-500 text-slate-200">@{l.seller?.username || 'Unknown'}</span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap capitalize text-slate-400">
                        {l.category}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-500">
                        ₹{l.startingPrice?.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-700 text-slate-100">
                        ₹{l.currentPrice?.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-600 text-slate-200">
                        {l.bidCount || 0}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`badge border capitalize text-[10px] ${
                          l.status === 'active' ? 'border-emerald-400/20 text-emerald-400 bg-emerald-400/10' :
                          l.status === 'scheduled' ? 'border-brand-400/20 text-brand-400 bg-brand-400/10' :
                          l.status === 'cancelled' ? 'border-rose-400/20 text-rose-400 bg-rose-400/10' :
                          'border-indigo-400/20 text-indigo-400 bg-indigo-400/10'
                        }`}>
                          {l.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {l.isModerated ? (
                          <span className="badge bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px]">
                            Hidden
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Safe</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Inspect details & bids */}
                          <button
                            onClick={() => handleInspect(l)}
                            className="btn btn-secondary btn-sm py-1 px-2 text-xs"
                            title="Inspect bids & details"
                          >
                            <Eye size={12} />
                          </button>

                          {/* Moderate / Restore */}
                          {l.isModerated ? (
                            <button
                              onClick={() => {
                                setModerateTarget(l);
                                setModerateAction('restore');
                              }}
                              className="btn btn-secondary btn-sm py-1 px-2 text-xs text-emerald-400 hover:text-emerald-300"
                              title="Restore to public"
                            >
                              <Eye size={12} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setModerateTarget(l);
                                setModerateAction('hide');
                              }}
                              className="btn btn-danger btn-sm py-1 px-2 text-xs"
                              title="Hide / Moderate listing"
                            >
                              <EyeOff size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
            <span>
              Showing page {page} of {pages} ({total} listings)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Modal */}
      {inspectListing && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass bg-surface-900 rounded-2xl max-w-2xl w-full p-6 border border-white/10 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <Gavel size={18} className="text-purple-400" /> Listing & Bid History Audit
              </h3>
              <button onClick={() => setInspectListing(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex items-start gap-4 p-3 rounded-xl bg-surface-800/60 border border-white/5 text-xs">
              <div className="w-16 h-16 rounded-xl bg-surface-700 shrink-0 overflow-hidden">
                {inspectListing.images?.[0] ? (
                  <img src={getImageUrl(inspectListing.images[0])} alt="" className="w-full h-full object-cover" />
                ) : (
                  '📦'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-600 text-slate-100 text-base truncate">{inspectListing.title}</h4>
                <p className="text-slate-400 mt-1">
                  Seller: @{inspectListing.seller?.username} · Category: {inspectListing.category}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                  <span>Start: ₹{inspectListing.startingPrice}</span>
                  <span>·</span>
                  <span>Leading: ₹{inspectListing.currentPrice}</span>
                  <span>·</span>
                  <span>Status: <strong className="text-slate-200 capitalize">{inspectListing.status}</strong></span>
                </div>
              </div>
            </div>

            {/* Bid History Table */}
            <div>
              <h5 className="font-600 text-slate-200 text-xs mb-2 uppercase tracking-wider">
                Full Verified Bid History ({inspectBids.length})
              </h5>
              {loadingBids ? (
                <p className="text-xs text-slate-500 py-6 text-center">Loading bid history…</p>
              ) : inspectBids.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center italic">No bids placed on this auction.</p>
              ) : (
                <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
                  {inspectBids.map((b, i) => (
                    <div
                      key={b._id}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40 text-xs border border-white/5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center font-700 text-[10px]">
                          {i + 1}
                        </span>
                        <span className="font-500 text-slate-200">@{b.bidder?.username}</span>
                        {b.isLateBid && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
                            ⚡ 30s Extension
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-700 text-emerald-400">₹{b.amount?.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-500 ml-2">
                          {new Date(b.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Moderation Confirmation Modal */}
      {moderateTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleModerateSubmit}
            className="glass bg-surface-900 rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} /> {moderateAction === 'hide' ? 'Hide / Moderate Listing' : 'Restore Listing'}
              </h3>
              <button type="button" onClick={() => setModerateTarget(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Target listing: <strong className="text-slate-100">"{moderateTarget.title}"</strong>
            </p>

            {moderateAction === 'hide' ? (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-xl leading-relaxed">
                ⚠️ Hiding this listing will immediately remove it from public search, category results, and feeds. Existing bid records will be preserved for audit.
              </div>
            ) : (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs p-3 rounded-xl">
                Restoring this listing will make it visible in public searches and active auction feeds again.
              </div>
            )}

            {moderateAction === 'hide' && (
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                  Moderation Reason (Required)
                </label>
                <textarea
                  required
                  className="input min-h-20 text-xs"
                  placeholder="e.g. Prohibited item, counterfeit, inaccurate description, copyright claim"
                  value={moderateReason}
                  onChange={(e) => setModerateReason(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModerateTarget(null)}
                className="btn btn-secondary flex-1"
                disabled={submittingModeration}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingModeration}
                className={`btn flex-1 ${moderateAction === 'hide' ? 'btn-danger' : 'btn-primary'}`}
              >
                {submittingModeration ? 'Processing…' : `Confirm ${moderateAction}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
