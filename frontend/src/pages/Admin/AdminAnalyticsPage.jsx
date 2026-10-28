import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api';
import {
  TrendAreaChart,
  StatusDistributionChart,
  DateRangeFilter,
} from '../../components/Charts';
import {
  BarChart3,
  Percent,
  CheckCircle,
  XCircle,
  TrendingUp,
  Award,
  Layers,
  Flag,
  Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('30d');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (period === 'custom' && customRange.startDate && customRange.endDate) {
        params.startDate = customRange.startDate;
        params.endDate = customRange.endDate;
      }
      const { data } = await adminApi.getAnalytics(params);
      setAnalytics(data);
    } catch (err) {
      toast.error('Failed to load platform analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period, customRange]);

  const m = analytics?.metrics || {};
  const categories = analytics?.categoryPopularity || [];
  const reportStats = analytics?.reportStatusMap || {};

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Title & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h1 className="font-display font-800 text-xl text-slate-100 flex items-center gap-2">
            <BarChart3 className="text-amber-400" size={22} /> Platform Analytics & Key Performance Indicators
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            System-wide auction completion, market efficiency, category demand, and moderation metrics.
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
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass rounded-2xl h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* Key Rates & KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4">
            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Auction Completion Rate</span>
                <CheckCircle size={18} className="text-emerald-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-emerald-400">{m.auctionCompletionRate}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {m.completedNormally} completed normally out of {m.eligibleDueToClose} due to close
                </p>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Seller Cancellation Rate</span>
                <XCircle size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-rose-400">{m.cancellationRate}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Proportion of created auctions cancelled before conclusion
                </p>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Auctions With Bids (%)</span>
                <Percent size={18} className="text-indigo-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-indigo-400">{m.percentWithBids}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Auctions that received at least 1 valid student bid
                </p>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Avg Bids / Auction</span>
                <TrendingUp size={18} className="text-amber-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-amber-300">{m.avgBidsPerAuction}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Market competition intensity across listings
                </p>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Avg Winning Bid</span>
                <Award size={18} className="text-sky-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-sky-400">₹{m.avgWinningBid?.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Across {m.closedWithWinnerCount || 0} successfully sold listings
                </p>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-500">Period Listing Inflow</span>
                <Layers size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="font-display font-800 text-3xl text-purple-400">{m.totalPeriodListings || 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Auctions created in the selected date window
                </p>
              </div>
            </div>
          </div>

          {/* Category Popularity & Moderation Breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Category Popularity */}
            <div className="glass rounded-2xl p-5 border border-white/8 flex flex-col gap-3">
              <h3 className="font-600 text-slate-200 text-sm flex items-center gap-2">
                <Layers size={16} className="text-purple-400" /> Category Distribution & Activity
              </h3>
              <p className="text-slate-400 text-xs">Listing volume and average starting price per category</p>

              <div className="flex flex-col gap-2 mt-2">
                {categories.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No category data recorded.</p>
                ) : (
                  categories.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-surface-800/40 border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-surface-700 flex items-center justify-center font-bold text-slate-300 text-[10px]">
                          {i + 1}
                        </span>
                        <span className="font-600 text-slate-200 capitalize">{c.category}</span>
                      </div>
                      <div className="text-right flex items-center gap-4">
                        <span className="text-slate-400">Avg Start: ₹{c.avgStartPrice}</span>
                        <span className="badge bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {c.listingsCount} {c.listingsCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Moderation Reports Status Breakdown */}
            <div className="glass rounded-2xl p-5 border border-white/8 flex flex-col gap-3">
              <h3 className="font-600 text-slate-200 text-sm flex items-center gap-2">
                <Flag size={16} className="text-rose-400" /> Moderation Workflow Status
              </h3>
              <p className="text-slate-400 text-xs">Breakdown of reported issues submitted during the period</p>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center">
                  <p className="text-[11px] text-rose-300 uppercase tracking-wider font-600">Pending</p>
                  <p className="font-display font-800 text-3xl text-rose-400 mt-1">{reportStats.PENDING || 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Awaiting review</p>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
                  <p className="text-[11px] text-amber-300 uppercase tracking-wider font-600">Under Review</p>
                  <p className="font-display font-800 text-3xl text-amber-400 mt-1">{reportStats.UNDER_REVIEW || 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">In progress</p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                  <p className="text-[11px] text-emerald-300 uppercase tracking-wider font-600">Resolved</p>
                  <p className="font-display font-800 text-3xl text-emerald-400 mt-1">{reportStats.RESOLVED || 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Action concluded</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-500/10 border border-slate-500/20 text-center">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wider font-600">Dismissed</p>
                  <p className="font-display font-800 text-3xl text-slate-300 mt-1">{reportStats.DISMISSED || 0}</p>
                  <p className="text-[10px] text-slate-500 mt-1">No action required</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
