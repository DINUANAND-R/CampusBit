import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api';
import { TrendAreaChart, DateRangeFilter } from '../../components/Charts';
import { Link } from 'react-router-dom';
import {
  Users,
  Package,
  Gavel,
  CheckCircle,
  Calendar,
  XCircle,
  ShieldAlert,
  Flag,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminOverviewPage() {
  const [period, setPeriod] = useState('30d');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (period === 'custom' && customRange.startDate && customRange.endDate) {
        params.startDate = customRange.startDate;
        params.endDate = customRange.endDate;
      }
      const res = await adminApi.getOverview(params);
      setData(res.data);
    } catch (err) {
      toast.error('Failed to load admin overview metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [period, customRange]);

  const metrics = data?.metrics || {};
  const recent = data?.recentActivity || {};

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Title & Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h1 className="font-display font-800 text-2xl text-slate-100 flex items-center gap-2">
            <Shield className="text-amber-400" size={24} /> Platform Control Center
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Real-time campus auction metrics, user moderation, and platform activity.
          </p>
        </div>

        <DateRangeFilter
          selectedPeriod={period}
          onPeriodChange={setPeriod}
          customRange={customRange}
          onCustomChange={setCustomRange}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="glass rounded-2xl h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* Key Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: metrics.totalUsers, icon: Users, color: 'text-indigo-400', hint: `+${metrics.newUsersPeriod || 0} in this period` },
              { label: 'Active Auctions', value: metrics.activeAuctions, icon: Gavel, color: 'text-emerald-400', hint: 'Live accepting bids' },
              { label: 'Scheduled / Upcoming', value: metrics.upcomingAuctions, icon: Calendar, color: 'text-brand-400', hint: `${metrics.scheduledListings || 0} scheduled` },
              { label: 'Closed Auctions', value: metrics.closedAuctions, icon: CheckCircle, color: 'text-sky-400', hint: 'Ended or completed' },
              { label: 'Total Listings', value: metrics.totalListings, icon: Package, color: 'text-purple-400', hint: 'Platform-wide total' },
              { label: 'Total Bids Placed', value: metrics.totalBids, icon: TrendingUp, color: 'text-amber-400', hint: 'Valid auction bids' },
              { label: 'Pending Reports', value: metrics.pendingReports, icon: Flag, color: metrics.pendingReports > 0 ? 'text-rose-400' : 'text-slate-400', hint: 'Require admin review' },
              { label: 'Suspended Accounts', value: metrics.suspendedUsers, icon: ShieldAlert, color: 'text-rose-400', hint: 'Banned or suspended' },
              { label: 'Cancelled Listings', value: metrics.cancelledListings, icon: XCircle, color: 'text-slate-400', hint: 'Seller/admin cancelled' },
              { label: 'Moderated Listings', value: metrics.moderatedListings, icon: AlertTriangle, color: 'text-amber-400', hint: 'Hidden from public' },
              { label: 'Handover Pending', value: metrics.awaitingHandover, icon: Clock, color: 'text-gold-400', hint: 'Awaiting OTP handover' },
            ].map(({ label, value, icon: Icon, color, hint }, idx) => (
              <div key={idx} className="glass rounded-2xl p-4 flex flex-col justify-between border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-500">{label}</span>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="font-display font-700 text-2xl text-slate-100">{value ?? 0}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Activity Over Time Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-600 text-slate-200 text-sm">Growth Trends</h3>
                  <p className="text-slate-400 text-xs">New user registrations vs new listings</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
                    <span className="text-slate-400">Users</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-400">Listings</span>
                  </div>
                </div>
              </div>
              <TrendAreaChart
                data={data?.timeline || []}
                dataKey="users"
                dataKey2="listings"
                label="New Users"
                label2="Listings Created"
                color="#818cf8"
                color2="#10b981"
                height={220}
              />
            </div>

            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-600 text-slate-200 text-sm">Bidding & Closures</h3>
                  <p className="text-slate-400 text-xs">Valid bid volume vs closed auctions</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-slate-400">Bids</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span className="text-slate-400">Closed</span>
                  </div>
                </div>
              </div>
              <TrendAreaChart
                data={data?.timeline || []}
                dataKey="bids"
                dataKey2="closed"
                label="Bids Placed"
                label2="Auctions Closed"
                color="#f59e0b"
                color2="#38bdf8"
                height={220}
              />
            </div>
          </div>

          {/* Recent Activity Feeds */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Feed 1: Recent Registrations */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <h3 className="font-600 text-slate-200 text-sm flex items-center gap-2">
                  <Users size={16} className="text-indigo-400" /> Recent Registrations
                </h3>
                <Link to="/admin/users" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>

              <div className="flex flex-col gap-2">
                {recent.recentUsers?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No recent registrations</p>
                ) : (
                  recent.recentUsers?.map((u) => (
                    <div key={u._id} className="flex items-center justify-between p-2 rounded-xl bg-surface-800/40 border border-white/5 text-xs">
                      <div className="min-w-0">
                        <p className="font-600 text-slate-200 truncate">@{u.username}</p>
                        <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                      </div>
                      <span className={`badge border text-[10px] ${
                        u.status === 'suspended' ? 'border-rose-400/20 text-rose-400 bg-rose-400/10' :
                        'border-emerald-400/20 text-emerald-400 bg-emerald-400/10'
                      }`}>
                        {u.status || 'active'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Feed 2: Recent Reports */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <h3 className="font-600 text-slate-200 text-sm flex items-center gap-2">
                  <Flag size={16} className="text-rose-400" /> Pending Reports
                </h3>
                <Link to="/admin/reports" className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>

              <div className="flex flex-col gap-2">
                {recent.recentReports?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No reports filed</p>
                ) : (
                  recent.recentReports?.map((r) => (
                    <div key={r._id} className="flex items-center justify-between p-2 rounded-xl bg-surface-800/40 border border-white/5 text-xs">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-600 text-slate-200 truncate capitalize">
                          {r.category?.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          By @{r.reporter?.username || 'User'}
                        </p>
                      </div>
                      <span className={`badge border text-[10px] ${
                        r.status === 'PENDING' ? 'border-rose-400/20 text-rose-400 bg-rose-400/10' :
                        'border-slate-500/20 text-slate-400 bg-slate-500/10'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Feed 3: Moderation Audit Log */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <h3 className="font-600 text-slate-200 text-sm flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-400" /> Moderation Log
                </h3>
                <span className="text-[10px] text-slate-500">Live Audit</span>
              </div>

              <div className="flex flex-col gap-2">
                {recent.recentModeration?.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No moderation actions yet</p>
                ) : (
                  recent.recentModeration?.map((m) => (
                    <div key={m._id} className="flex flex-col gap-1 p-2 rounded-xl bg-surface-800/40 border border-white/5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-600 text-amber-300 text-[11px]">{m.action?.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-300 truncate font-500">{m.targetName}</p>
                      <p className="text-[10px] text-slate-500 italic truncate">"{m.reason}"</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
