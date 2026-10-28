import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api';
import {
  Flag,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Shield,
  X,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Review / Resolve modal
  const [selectedReport, setSelectedReport] = useState(null);
  const [newStatus, setNewStatus] = useState('UNDER_REVIEW');
  const [internalNote, setInternalNote] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      };
      const { data } = await adminApi.getReports(params);
      setReports(data.reports || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      toast.error('Failed to load user reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter, categoryFilter]);

  const handleOpenReview = (report) => {
    setSelectedReport(report);
    setNewStatus(report.status);
    setInternalNote('');
    setActionTaken(report.actionTaken || '');
  };

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await adminApi.updateReport(selectedReport._id, {
        status: newStatus,
        internalNote: internalNote.trim() || undefined,
        actionTaken: actionTaken.trim(),
      });
      toast.success('Report updated successfully.');
      setSelectedReport(null);
      fetchReports();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update report');
    } finally {
      setSubmitting(false);
    }
  };

  const reportCategories = [
    'inappropriate_content',
    'counterfeit_item',
    'spam',
    'harassment',
    'shill_bidding',
    'misleading_information',
    'other',
  ];

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Title & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h1 className="font-display font-800 text-xl text-slate-100 flex items-center gap-2">
            <Flag className="text-rose-400" size={22} /> Reports & Moderation
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Review user-submitted reports regarding prohibited listings, shill bidding, and community violations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2.5 text-xs w-36"
          >
            <option value="all">All Statuses</option>
            <option value="PENDING">Pending Review</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>

          {/* Category filter */}
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2.5 text-xs w-36 capitalize"
          >
            <option value="all">All Categories</option>
            {reportCategories.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Reports Table */}
      <div className="glass rounded-2xl p-5 border border-white/8 flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-800/80 uppercase tracking-wider text-[10px] text-slate-400 border-b border-white/5">
              <tr>
                <th className="py-3 px-3">Target</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Reporter</th>
                <th className="py-3 px-3">Description</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Filed</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading reports…
                  </td>
                </tr>
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No reports found matching criteria.
                  </td>
                </tr>
              ) : (
                reports.map((r) => (
                  <tr key={r._id} className="hover:bg-white/2 transition-colors">
                    <td className="py-3 px-3 whitespace-nowrap">
                      {r.targetType === 'listing' ? (
                        <div className="flex items-center gap-1.5 font-600 text-slate-200">
                          <span>📦</span>
                          <span className="truncate max-w-[160px]">{r.targetListing?.title || 'Listing item'}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 font-600 text-slate-200">
                          <span>👤</span>
                          <span>@{r.targetUser?.username || 'User account'}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap capitalize text-rose-300 font-500">
                      {r.category?.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                      @{r.reporter?.username || 'Anonymous'}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-slate-300" title={r.description}>
                      {r.description}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`badge border text-[10px] font-600 ${
                        r.status === 'PENDING' ? 'border-rose-400/20 text-rose-400 bg-rose-400/10' :
                        r.status === 'UNDER_REVIEW' ? 'border-amber-400/20 text-amber-400 bg-amber-400/10' :
                        r.status === 'RESOLVED' ? 'border-emerald-400/20 text-emerald-400 bg-emerald-400/10' :
                        'border-slate-500/20 text-slate-400 bg-slate-500/10'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleOpenReview(r)}
                        className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-brand-300"
                      >
                        Review →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
            <span>
              Showing page {page} of {pages} ({total} reports)
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

      {/* Review Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReviewSubmit}
            className="glass bg-surface-900 rounded-2xl max-w-xl w-full p-6 border border-white/10 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-scale-up"
          >
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <Shield size={18} className="text-amber-400" /> Moderation Review: #{selectedReport._id.slice(-6)}
              </h3>
              <button type="button" onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            {/* Target Details */}
            <div className="p-3 rounded-xl bg-surface-800/60 border border-white/5 text-xs flex flex-col gap-1.5">
              <p className="font-600 text-slate-200">
                Category: <span className="capitalize text-rose-300">{selectedReport.category?.replace(/_/g, ' ')}</span>
              </p>
              <p className="text-slate-300">
                Reporter: <strong>@{selectedReport.reporter?.username}</strong> ({selectedReport.reporter?.email})
              </p>
              <p className="text-slate-400 mt-1">
                <strong>Description:</strong> "{selectedReport.description}"
              </p>
            </div>

            {/* Status selector */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Report Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="input text-xs"
              >
                <option value="PENDING">PENDING</option>
                <option value="UNDER_REVIEW">UNDER REVIEW</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="DISMISSED">DISMISSED</option>
              </select>
            </div>

            {/* Action Taken */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Action Taken (e.g. Listing hidden, user warned, account suspended, false alarm)
              </label>
              <input
                className="input text-xs"
                placeholder="Action summary…"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
              />
            </div>

            {/* Internal Note */}
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Add Internal Admin Note (Visible only to administrators)
              </label>
              <textarea
                className="input min-h-16 text-xs"
                placeholder="Internal investigation details, cross-references…"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
              />
            </div>

            {/* Existing Internal Notes */}
            {selectedReport.internalNotes?.length > 0 && (
              <div>
                <p className="text-xs font-600 text-slate-300 mb-1.5">Previous Admin Notes:</p>
                <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                  {selectedReport.internalNotes.map((n, i) => (
                    <div key={i} className="p-2 rounded-lg bg-surface-800/40 border border-white/5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-400 text-[10px]">
                        <span>@{n.admin?.username || 'Admin'}</span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-200 mt-0.5">{n.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="btn btn-secondary flex-1"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary flex-1"
              >
                {submitting ? 'Saving…' : 'Save Review'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
