import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import {
  Users,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  X,
  UserCheck,
  UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminUsersPage() {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal states
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailData, setUserDetailData] = useState(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);

  // Status moderation action modal
  const [statusModalUser, setStatusModalUser] = useState(null);
  const [actionType, setActionType] = useState('suspend'); // 'suspend' | 'reinstate' | 'ban'
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Role change modal
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [targetRole, setTargetRole] = useState('admin');
  const [roleReason, setRoleReason] = useState('');
  const [submittingRole, setSubmittingRole] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search: search.trim() || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      };
      const { data } = await adminApi.getUsers(params);
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      toast.error('Failed to load user management records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchUsers();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load user details for modal
  const handleViewUser = async (u) => {
    setSelectedUser(u);
    setLoadingUserDetail(true);
    try {
      const { data } = await adminApi.getUser(u._id);
      setUserDetailData(data);
    } catch (err) {
      toast.error('Failed to load user details');
      setSelectedUser(null);
    } finally {
      setLoadingUserDetail(false);
    }
  };

  // Submit status update (suspend/reinstate/ban)
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!actionReason.trim()) {
      toast.error('A moderation reason is required.');
      return;
    }
    setSubmittingAction(true);
    try {
      await adminApi.updateUserStatus(statusModalUser._id, {
        action: actionType,
        reason: actionReason.trim(),
      });
      toast.success(`User status updated to ${actionType === 'reinstate' ? 'active' : actionType} successfully.`);
      setStatusModalUser(null);
      setActionReason('');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user status');
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit role update (student/admin)
  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    setSubmittingRole(true);
    try {
      await adminApi.updateUserRole(roleModalUser._id, {
        role: targetRole,
        reason: roleReason.trim() || 'Role modification by administrator',
      });
      toast.success(`User role updated to ${targetRole}.`);
      setRoleModalUser(null);
      setRoleReason('');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update user role');
    } finally {
      setSubmittingRole(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Title & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h1 className="font-display font-800 text-xl text-slate-100 flex items-center gap-2">
            <Users className="text-indigo-400" size={22} /> User Management
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Browse accounts, review activity, moderate bad actors, and manage administrative roles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username, email, campus ID…"
              className="input pl-8 py-1.5 text-xs w-52 sm:w-64"
            />
          </div>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2.5 text-xs w-28"
          >
            <option value="all">All Roles</option>
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input py-1.5 px-2.5 text-xs w-28"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass rounded-2xl p-5 border border-white/8 flex flex-col gap-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-surface-800/80 uppercase tracking-wider text-[10px] text-slate-400 border-b border-white/5">
              <tr>
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Campus ID</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Listings</th>
                <th className="py-3 px-3">Bids</th>
                <th className="py-3 px-3">Registered</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Loading user records…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No users found matching your search or filters.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u._id === currentAdmin?._id;
                  const isSuspended = u.status === 'suspended' || u.status === 'banned';

                  return (
                    <tr key={u._id} className="hover:bg-white/2 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-700 text-xs text-white">
                            {u.username?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-600 text-slate-200 flex items-center gap-1.5">
                              @{u.username}
                              {isSelf && (
                                <span className="text-[10px] bg-brand-500/20 text-brand-300 px-1.5 rounded">You</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                        {u.campusId || '—'}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`badge border text-[10px] uppercase font-700 ${
                          u.role === 'admin'
                            ? 'border-amber-400/30 text-amber-300 bg-amber-400/10'
                            : 'border-slate-500/30 text-slate-400 bg-slate-500/10'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`badge border text-[10px] capitalize font-600 ${
                          u.status === 'banned'
                            ? 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                            : u.status === 'suspended'
                            ? 'border-amber-400/30 text-amber-400 bg-amber-400/10'
                            : 'border-emerald-400/30 text-emerald-400 bg-emerald-400/10'
                        }`}>
                          {u.status || 'active'}
                        </span>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-600 text-slate-200">
                        {u.listingsCount || 0}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap font-600 text-slate-200">
                        {u.bidsCount || 0}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-slate-500 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* View details */}
                          <button
                            onClick={() => handleViewUser(u)}
                            className="btn btn-secondary btn-sm py-1 px-2 text-xs"
                            title="View user details"
                          >
                            <Eye size={12} />
                          </button>

                          {/* Moderate status (suspend/reinstate) */}
                          {!isSelf && (
                            <>
                              {isSuspended ? (
                                <button
                                  onClick={() => {
                                    setStatusModalUser(u);
                                    setActionType('reinstate');
                                  }}
                                  className="btn btn-secondary btn-sm py-1 px-2 text-xs text-emerald-400 hover:text-emerald-300"
                                  title="Reinstate account"
                                >
                                  <UserCheck size={12} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setStatusModalUser(u);
                                    setActionType('suspend');
                                  }}
                                  className="btn btn-danger btn-sm py-1 px-2 text-xs"
                                  title="Suspend account"
                                >
                                  <UserX size={12} />
                                </button>
                              )}

                              {/* Role toggle */}
                              <button
                                onClick={() => {
                                  setRoleModalUser(u);
                                  setTargetRole(u.role === 'admin' ? 'student' : 'admin');
                                }}
                                className="btn btn-secondary btn-sm py-1 px-2 text-xs text-amber-400 hover:text-amber-300"
                                title="Change role"
                              >
                                <Shield size={12} />
                              </button>
                            </>
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
              Showing page {page} of {pages} ({total} users)
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

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass bg-surface-900 rounded-2xl max-w-2xl w-full p-6 border border-white/10 flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <Users size={18} className="text-indigo-400" /> Account Inspection
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            {loadingUserDetail || !userDetailData ? (
              <div className="py-12 text-center text-slate-400 text-xs">Loading user profile and history…</div>
            ) : (
              <div className="flex flex-col gap-4 text-xs">
                {/* User Header */}
                <div className="p-3 rounded-xl bg-surface-800/60 border border-white/5 flex items-center justify-between">
                  <div>
                    <p className="font-700 text-slate-100 text-base">@{userDetailData.user.username}</p>
                    <p className="text-slate-400">{userDetailData.user.email} · Campus ID: {userDetailData.user.campusId || 'None'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Joined: {new Date(userDetailData.user.createdAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge border text-[11px] uppercase font-700 block mb-1">
                      {userDetailData.user.role}
                    </span>
                    <span className="badge border capitalize">
                      {userDetailData.user.status || 'active'}
                    </span>
                  </div>
                </div>

                {/* Suspension Details if any */}
                {userDetailData.user.suspensionReason && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                    <p className="font-600">Suspension Notice:</p>
                    <p className="text-rose-200/80 mt-0.5">{userDetailData.user.suspensionReason}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Suspended on: {new Date(userDetailData.user.suspendedAt).toLocaleString()}</p>
                  </div>
                )}

                {/* Recent Listings */}
                <div>
                  <h4 className="font-600 text-slate-200 mb-2">Recent Listings ({userDetailData.listings?.length || 0})</h4>
                  {userDetailData.listings?.length === 0 ? (
                    <p className="text-slate-500 italic">No listings created.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {userDetailData.listings.map((l) => (
                        <div key={l._id} className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40 border border-white/5">
                          <span className="text-slate-200 truncate max-w-xs">{l.title}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-700 text-slate-100">₹{l.currentPrice}</span>
                            <span className="badge border text-[9px] capitalize">{l.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Moderation History */}
                {userDetailData.auditHistory?.length > 0 && (
                  <div>
                    <h4 className="font-600 text-slate-200 mb-2">Moderation Audit Trail</h4>
                    <div className="flex flex-col gap-1.5">
                      {userDetailData.auditHistory.map((a) => (
                        <div key={a._id} className="p-2 rounded-lg bg-surface-800/40 border border-white/5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-600 text-amber-300">{a.action}</span>
                            <span className="text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-slate-400 mt-0.5">By @{a.admin?.username}: "{a.reason}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Moderation Action Modal (Suspend / Ban / Reinstate) */}
      {statusModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleStatusSubmit} className="glass bg-surface-900 rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-rose-400">
                <AlertTriangle size={18} /> Moderation: {actionType === 'reinstate' ? 'Reinstate Account' : `${actionType} Account`}
              </h3>
              <button type="button" onClick={() => setStatusModalUser(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Target user: <strong className="text-slate-100">@{statusModalUser.username}</strong> ({statusModalUser.email})
            </p>

            {actionType === 'reinstate' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs p-3 rounded-xl">
                Reinstating this account will allow the student to log in, create listings, and place auction bids again.
              </div>
            ) : (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3 rounded-xl">
                ⚠️ <strong>Warning:</strong> {actionType === 'ban' ? 'Banning' : 'Suspending'} will immediately block all active tokens and reject any future login or bidding attempts from this user.
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Reason for {actionType} (Required)
              </label>
              <textarea
                required
                className="input min-h-20 text-xs"
                placeholder="e.g. Repeated shill bidding, abusive behavior, policy violation"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStatusModalUser(null)}
                className="btn btn-secondary flex-1"
                disabled={submittingAction}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className={`btn flex-1 ${actionType === 'reinstate' ? 'btn-primary' : 'btn-danger'}`}
              >
                {submittingAction ? 'Processing…' : `Confirm ${actionType}`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleRoleSubmit} className="glass bg-surface-900 rounded-2xl max-w-md w-full p-6 border border-white/10 flex flex-col gap-4 animate-scale-up">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2 text-amber-400">
                <Shield size={18} /> Administrative Role Workflow
              </h3>
              <button type="button" onClick={() => setRoleModalUser(null)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <p className="text-slate-300 text-sm">
              Change role for <strong className="text-slate-100">@{roleModalUser.username}</strong> from <span className="uppercase text-amber-300 font-600">{roleModalUser.role}</span> to:
            </p>

            <select
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="input text-xs"
            >
              <option value="student">Student (Standard user)</option>
              <option value="admin">Admin (Full administrative control)</option>
            </select>

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                Audit Justification / Note
              </label>
              <input
                className="input text-xs"
                placeholder="Reason for role alteration"
                value={roleReason}
                onChange={(e) => setRoleReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="btn btn-secondary flex-1"
                disabled={submittingRole}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingRole}
                className="btn btn-primary flex-1"
              >
                {submittingRole ? 'Saving…' : 'Update Role'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
