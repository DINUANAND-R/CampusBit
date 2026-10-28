import { useState, useEffect } from 'react';
import { wantedAlertsApi } from '../../api';
import toast from 'react-hot-toast';
import {
  Bell,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit3,
  Calendar,
  Clock,
  Tag,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  X,
  Sparkles,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'books', label: 'Books & Notes' },
  { id: 'electronics', label: 'Electronics & Gadgets' },
  { id: 'clothing', label: 'Clothing & Lab Coats' },
  { id: 'furniture', label: 'Furniture & Hostel' },
  { id: 'sports', label: 'Sports & Fitness' },
  { id: 'other', label: 'Other Essentials' },
];

const CONDITIONS = [
  { id: 'any', label: 'Any Condition' },
  { id: 'new', label: 'Brand New' },
  { id: 'like-new', label: 'Like New' },
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
];

const formatTimeLeft = (expiresAt) => {
  if (!expiresAt) return '';
  const now = new Date();
  const end = new Date(expiresAt);
  const diffDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Expired';
  if (diffDays === 1) return 'Expires tomorrow';
  return `Expires in ${diffDays} days`;
};

export default function WantedAlertsView() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState(null);
  const [matchesModalAlert, setMatchesModalAlert] = useState(null);
  const [alertMatches, setAlertMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    keywords: '',
    description: '',
    category: 'all',
    maxBudget: '',
    condition: 'any',
    durationDays: 30,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const { data } = await wantedAlertsApi.getAll(params);
      setAlerts(data.alerts || []);
    } catch (err) {
      toast.error('Failed to load wanted alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter]);

  const handleOpenCreate = () => {
    setFormData({
      keywords: '',
      description: '',
      category: 'all',
      maxBudget: '',
      condition: 'any',
      durationDays: 30,
    });
    setEditingAlert(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenEdit = (alert) => {
    setFormData({
      keywords: alert.keywords,
      description: alert.description || '',
      category: alert.category || 'all',
      maxBudget: alert.maxBudget,
      condition: alert.condition || 'any',
      durationDays: 30,
    });
    setEditingAlert(alert);
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.keywords.trim()) {
      toast.error('Please enter keywords or item name');
      return;
    }
    if (!formData.maxBudget || Number(formData.maxBudget) <= 0) {
      toast.error('Please enter a valid maximum budget');
      return;
    }

    setSubmitting(true);
    try {
      if (editingAlert) {
        const { data } = await wantedAlertsApi.update(editingAlert._id, formData);
        toast.success('Wanted alert updated successfully');
        setAlerts((prev) => prev.map((a) => (a._id === editingAlert._id ? data.alert : a)));
      } else {
        const { data } = await wantedAlertsApi.create(formData);
        toast.success('Wanted alert created! We will notify you when matching items are listed.');
        setAlerts((prev) => [data.alert, ...prev]);
      }
      setIsCreateModalOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save wanted alert');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (alert) => {
    const nextStatus = alert.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const { data } = await wantedAlertsApi.updateStatus(alert._id, { status: nextStatus });
      toast.success(`Alert ${nextStatus === 'ACTIVE' ? 'resumed' : 'paused'}`);
      setAlerts((prev) => prev.map((a) => (a._id === alert._id ? data.alert : a)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update alert status');
    }
  };

  const handleExtendAlert = async (alert) => {
    try {
      const { data } = await wantedAlertsApi.updateStatus(alert._id, { extendDays: 30 });
      toast.success('Alert extended for +30 days!');
      setAlerts((prev) => prev.map((a) => (a._id === alert._id ? data.alert : a)));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to extend alert');
    }
  };

  const handleDelete = async (alertId) => {
    if (!window.confirm('Are you sure you want to delete this wanted alert?')) return;
    try {
      await wantedAlertsApi.delete(alertId);
      toast.success('Wanted alert removed');
      setAlerts((prev) => prev.filter((a) => a._id !== alertId));
    } catch (err) {
      toast.error('Failed to delete wanted alert');
    }
  };

  const handleViewMatches = async (alert) => {
    setMatchesModalAlert(alert);
    setLoadingMatches(true);
    try {
      const { data } = await wantedAlertsApi.getMatches(alert._id);
      setAlertMatches(data.matches || []);
    } catch (err) {
      toast.error('Failed to load matching listings');
    } finally {
      setLoadingMatches(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Top Bar & Actions ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-700 text-xl text-slate-100 flex items-center gap-2">
            <Sparkles size={20} className="text-amber-400" />
            Smart Wanted Alerts
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Save items you are hunting for. Get notified automatically when a matching listing goes live.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          id="create-wanted-alert-btn"
          className="btn btn-primary btn-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus size={16} /> New Wanted Alert
        </button>
      </div>

      {/* ── Filter Tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs">
        {[
          { id: 'all', label: 'All Alerts' },
          { id: 'ACTIVE', label: 'Active' },
          { id: 'PAUSED', label: 'Paused' },
          { id: 'EXPIRED', label: 'Expired' },
        ].map((f) => (
          <button
            key={f.id}
            id={`filter-alert-${f.id}`}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl font-600 transition-all ${
              statusFilter === f.id
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/20'
                : 'glass text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Alerts List ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl h-28 animate-pulse" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-3">
            <Bell size={28} />
          </div>
          <h3 className="font-display font-600 text-base text-slate-200">No wanted alerts found</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4 leading-relaxed">
            Need a scientific calculator, textbook, lab apron, or bicycle? Create an alert and CampusBid will monitor new listings 24/7 for you.
          </p>
          <button onClick={handleOpenCreate} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={15} /> Create your first alert
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert) => {
            const isExpired = alert.status === 'EXPIRED' || new Date(alert.expiresAt) <= new Date();
            const isActive = alert.status === 'ACTIVE' && !isExpired;

            return (
              <div
                key={alert._id}
                className={`glass rounded-2xl p-4 border transition-all flex flex-col justify-between ${
                  isActive
                    ? 'border-white/10 hover:border-brand-500/40 bg-slate-900/40'
                    : 'border-white/5 bg-slate-950/40 opacity-75'
                }`}
              >
                <div>
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-100 text-sm truncate flex items-center gap-1.5">
                        {alert.keywords}
                      </h4>
                      {alert.description && (
                        <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{alert.description}</p>
                      )}
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        isExpired
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                          : isActive
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                      }`}
                    >
                      {isExpired ? 'EXPIRED' : alert.status}
                    </span>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap gap-1.5 text-[11px] mb-3">
                    <span className="px-2 py-0.5 rounded-lg bg-surface-600/60 text-slate-300 border border-white/5 flex items-center gap-1">
                      <Tag size={11} className="text-brand-400" />
                      Budget: ₹{alert.maxBudget}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-surface-600/60 text-slate-300 border border-white/5 capitalize">
                      {alert.category === 'all' ? 'Any category' : alert.category}
                    </span>
                    {alert.condition !== 'any' && (
                      <span className="px-2 py-0.5 rounded-lg bg-surface-600/60 text-slate-300 border border-white/5 capitalize">
                        {alert.condition}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer and Actions */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Clock size={12} />
                    <span>{formatTimeLeft(alert.expiresAt)}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* View Matches Button */}
                    <button
                      onClick={() => handleViewMatches(alert)}
                      title="View matching listings"
                      className="btn btn-secondary btn-sm py-1 px-2 text-xs flex items-center gap-1 text-slate-300 hover:text-white"
                    >
                      <Sparkles size={12} className={alert.matchCount > 0 ? 'text-amber-400' : ''} />
                      <span>{alert.matchCount || 0} matches</span>
                    </button>

                    {/* Pause / Resume / Extend */}
                    {isExpired ? (
                      <button
                        onClick={() => handleExtendAlert(alert)}
                        title="Extend alert for +30 days"
                        className="btn btn-secondary btn-sm py-1 px-2 text-xs text-brand-400 hover:text-brand-300"
                      >
                        <RefreshCw size={12} /> Extend
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleStatus(alert)}
                        title={alert.status === 'ACTIVE' ? 'Pause Alert' : 'Resume Alert'}
                        className="btn btn-secondary btn-sm p-1.5 text-slate-400 hover:text-white"
                      >
                        {alert.status === 'ACTIVE' ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => handleOpenEdit(alert)}
                      title="Edit alert"
                      className="btn btn-secondary btn-sm p-1.5 text-slate-400 hover:text-white"
                    >
                      <Edit3 size={13} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(alert._id)}
                      title="Delete alert"
                      className="btn btn-secondary btn-sm p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ────────────────────────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl bg-slate-900/95 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" />
                {editingAlert ? 'Edit Wanted Alert' : 'Create Wanted Alert'}
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
              {/* Keywords */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Item Name or Search Keywords <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scientific Calculator FX-991, Engineering Drafter, Lab Coat"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Specifications or Notes <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Need Casio model with matrix mode or 2nd semester syllabus books"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full py-2 text-xs"
                />
              </div>

              {/* Grid: Category & Max Budget */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="input w-full py-2 text-xs"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Maximum Budget (₹) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 500"
                    value={formData.maxBudget}
                    onChange={(e) => setFormData({ ...formData, maxBudget: e.target.value })}
                    className="input w-full py-2 text-xs"
                  />
                </div>
              </div>

              {/* Grid: Condition & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Preferred Condition</label>
                  <select
                    value={formData.condition}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                    className="input w-full py-2 text-xs"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.id} value={c.id} className="bg-slate-900">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Alert Duration</label>
                  <select
                    value={formData.durationDays}
                    onChange={(e) => setFormData({ ...formData, durationDays: Number(e.target.value) })}
                    className="input w-full py-2 text-xs"
                  >
                    <option value={14} className="bg-slate-900">14 Days</option>
                    <option value={30} className="bg-slate-900">30 Days (Recommended)</option>
                    <option value={60} className="bg-slate-900">60 Days</option>
                    <option value={90} className="bg-slate-900">90 Days</option>
                  </select>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                <span className="font-bold">Auction Notice:</span> Matching filters listings whose starting price is within your budget. Because auctions are dynamic, final bids may exceed your budget limit.
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {submitting ? 'Saving...' : editingAlert ? 'Update Alert' : 'Create Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Matched Listings Modal ─────────────────────────────────────── */}
      {matchesModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel border border-white/10 rounded-2xl max-w-xl w-full p-6 shadow-2xl bg-slate-900/95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4 shrink-0">
              <div>
                <h3 className="font-display font-700 text-base text-slate-100 flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" />
                  Matched Listings: "{matchesModalAlert.keywords}"
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Budget limit: ₹{matchesModalAlert.maxBudget} • {matchesModalAlert.category}
                </p>
              </div>
              <button
                onClick={() => setMatchesModalAlert(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-white/5 scrollbar-thin">
              {loadingMatches ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  Loading matches...
                </div>
              ) : alertMatches.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                    <Search size={20} />
                  </div>
                  <p className="font-medium text-slate-300">No matching products yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs">
                    As soon as another student lists an item matching your keywords within your budget, it will appear here and trigger a notification.
                  </p>
                </div>
              ) : (
                alertMatches.map((match) => {
                  const listing = match.listing;
                  if (!listing) return null;

                  return (
                    <div
                      key={match._id}
                      className="py-3 flex items-start gap-3 group hover:bg-white/[0.02] rounded-xl px-2 transition-colors"
                    >
                      {listing.images?.[0]?.url ? (
                        <img
                          src={listing.images[0].url}
                          alt={listing.title}
                          className="w-12 h-12 rounded-xl object-cover bg-slate-800 border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10 flex items-center justify-center text-slate-500 shrink-0">
                          <Tag size={18} />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                            {listing.title}
                          </h4>
                          <span className="text-[10px] font-bold text-emerald-400 shrink-0">
                            Starts at ₹{listing.startingPrice}
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{match.matchReason}</p>

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-slate-500 capitalize">
                            Status: <span className="text-slate-300 font-medium">{listing.status}</span>
                          </span>

                          <a
                            href={`/listings/${listing._id}`}
                            className="btn btn-secondary btn-sm py-0.5 px-2 text-[10px] flex items-center gap-1 text-brand-300 hover:text-white"
                          >
                            View Auction <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
