import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sellerAnalyticsApi } from '../../api';
import {
  TrendAreaChart,
  ComparisonBarChart,
  StatusDistributionChart,
  DateRangeFilter,
} from '../../components/Charts';
import { getImageUrl } from '../../utils/imageUrl';
import {
  Gavel,
  Package,
  TrendingUp,
  Users,
  Eye,
  CheckCircle,
  Clock,
  Calendar,
  AlertTriangle,
  Award,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Edit3,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function SellerAnalyticsView() {
  const [period, setPeriod] = useState('30d');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });

  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [listingsData, setListingsData] = useState({ listings: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);

  // Filter & Search states for the individual listings table
  const [tableSearch, setTableSearch] = useState('');
  const [tableStatus, setTableStatus] = useState('all');
  const [tablePage, setTablePage] = useState(1);
  const [tableSort, setTableSort] = useState('createdAt_desc');

  // Deep-dive single listing modal state
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [singleListingDetail, setSingleListingDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Fetch overview and trends
  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const params = { period };
      if (period === 'custom' && customRange.startDate && customRange.endDate) {
        params.startDate = customRange.startDate;
        params.endDate = customRange.endDate;
      }

      const [ovRes, trRes] = await Promise.all([
        sellerAnalyticsApi.getOverview(params),
        sellerAnalyticsApi.getTrends(params),
      ]);

      setOverview(ovRes.data);
      setTrends(trRes.data);
    } catch (err) {
      toast.error('Failed to load seller analytics data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch paginated listings table
  const fetchTableListings = async () => {
    try {
      const params = {
        page: tablePage,
        limit: 8,
        search: tableSearch.trim() || undefined,
        status: tableStatus !== 'all' ? tableStatus : undefined,
        sort: tableSort,
      };
      const { data } = await sellerAnalyticsApi.getListings(params);
      setListingsData(data);
    } catch (err) {
      console.error('Failed to load listings table analytics', err);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [period, customRange]);

  useEffect(() => {
    fetchTableListings();
  }, [tablePage, tableStatus, tableSort]);

  // Debounced search on table
  useEffect(() => {
    const timer = setTimeout(() => {
      setTablePage(1);
      fetchTableListings();
    }, 350);
    return () => clearTimeout(timer);
  }, [tableSearch]);

  // Fetch single listing detail modal
  const openListingDetailModal = async (id) => {
    setSelectedListingId(id);
    setLoadingDetail(true);
    try {
      const { data } = await sellerAnalyticsApi.getSingleListing(id);
      setSingleListingDetail(data);
    } catch (err) {
      toast.error('Failed to load listing analytics details');
      setSelectedListingId(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const metrics = overview?.metrics || {};
  const insights = overview?.insights || {};

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Date Filter & Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass rounded-2xl p-5 border border-white/8">
        <div>
          <h2 className="font-display font-700 text-xl text-slate-100 flex items-center gap-2">
            <TrendingUp size={20} className="text-brand-400" /> Seller Analytics
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Performance metrics, bid trends, and engagement across your auction inventory.
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
          {/* Overview Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Listings',
                value: metrics.totalListings ?? 0,
                icon: Package,
                color: 'text-indigo-400',
                hint: 'All auctions created',
              },
              {
                label: 'Active Auctions',
                value: metrics.activeAuctions ?? 0,
                icon: Gavel,
                color: 'text-emerald-400',
                hint: 'Currently open for bidding',
              },
              {
                label: 'Scheduled Auctions',
                value: metrics.scheduledListings ?? 0,
                icon: Calendar,
                color: 'text-brand-400',
                hint: 'Scheduled for future launch',
              },
              {
                label: 'Closed / Completed',
                value: metrics.closedAuctions ?? 0,
                icon: CheckCircle,
                color: 'text-sky-400',
                hint: 'Auctions that ended',
              },
              {
                label: 'Total Bids Received',
                value: metrics.totalBids ?? 0,
                icon: TrendingUp,
                color: 'text-amber-400',
                hint: 'Valid bids on your items',
              },
              {
                label: 'Unique Bidders',
                value: metrics.uniqueBidders ?? 0,
                icon: Users,
                color: 'text-purple-400',
                hint: 'Distinct students who bid',
              },
              {
                label: 'Listings With Bids',
                value: `${metrics.listingsWithBidsCount ?? 0} / ${metrics.totalListings ?? 0}`,
                icon: Award,
                color: 'text-rose-400',
                hint: 'Received at least 1 bid',
              },
              {
                label: 'Avg Bids / Auction',
                value: metrics.avgBidsPerAuction ?? 0,
                icon: TrendingUp,
                color: 'text-teal-400',
                hint: 'Average bidding engagement',
              },
              {
                label: 'Total Views',
                value: metrics.totalViews ?? 0,
                icon: Eye,
                color: 'text-cyan-400',
                hint: 'Unique listing impressions',
              },
              {
                label: 'Avg Starting Price',
                value: `₹${metrics.avgStartingPrice?.toLocaleString() ?? 0}`,
                icon: Package,
                color: 'text-blue-400',
                hint: 'Average initial price set',
              },
              {
                label: 'Winning Bid Value',
                value: `₹${metrics.totalWinningBidValue?.toLocaleString() ?? 0}`,
                icon: CheckCircle,
                color: 'text-emerald-400',
                hint: 'Sum of final bids for completed items',
              },
              {
                label: 'Awaiting Handover',
                value: metrics.awaitingHandover ?? 0,
                icon: Clock,
                color: 'text-gold-400',
                hint: 'Pending seller approval or OTP',
              },
            ].map(({ label, value, icon: Icon, color, hint }, idx) => (
              <div key={idx} className="glass rounded-2xl p-4 flex flex-col justify-between border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-500">{label}</span>
                  <Icon size={16} className={color} />
                </div>
                <div>
                  <p className="font-display font-700 text-2xl text-slate-100">{value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{hint}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Actionable Data-Driven Insights Cards */}
          {(insights.mostBiddedListing || insights.highestPriceIncreaseListing || insights.zeroBidCount > 0) && (
            <div className="grid sm:grid-cols-3 gap-4">
              {insights.mostBiddedListing && (
                <div className="glass rounded-2xl p-4 border border-brand-500/20 bg-brand-500/5">
                  <div className="flex items-center gap-2 text-brand-400 text-xs font-600 uppercase tracking-wider mb-1">
                    <Award size={14} /> Most Popular Auction
                  </div>
                  <p className="font-600 text-slate-200 text-sm truncate" title={insights.mostBiddedListing.title}>
                    "{insights.mostBiddedListing.title}"
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Received <strong className="text-brand-300">{insights.mostBiddedListing.bidCount} bids</strong> (Current: ₹{insights.mostBiddedListing.currentPrice})
                  </p>
                </div>
              )}

              {insights.highestPriceIncreaseListing && (
                <div className="glass rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-600 uppercase tracking-wider mb-1">
                    <TrendingUp size={14} /> Highest Price Growth
                  </div>
                  <p className="font-600 text-slate-200 text-sm truncate" title={insights.highestPriceIncreaseListing.title}>
                    "{insights.highestPriceIncreaseListing.title}"
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Price surged by <strong className="text-emerald-300">+{insights.highestPriceIncreaseListing.increasePercent}%</strong> (₹{insights.highestPriceIncreaseListing.startingPrice} → ₹{insights.highestPriceIncreaseListing.finalPrice})
                  </p>
                </div>
              )}

              {insights.zeroBidCount > 0 && (
                <div className="glass rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-600 uppercase tracking-wider mb-1">
                    <AlertTriangle size={14} /> Unbid Auctions Alert
                  </div>
                  <p className="font-600 text-slate-200 text-sm">
                    {insights.zeroBidCount} auction{insights.zeroBidCount === 1 ? '' : 's'} have 0 bids
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Consider adjusting your starting prices or adding clearer item photos.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Performance Charts Section */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Chart 1: Daily Activity Trends (Listings & Bids) */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-600 text-slate-200 text-sm">Activity Over Time</h3>
                  <p className="text-slate-400 text-xs">Daily listings created vs bids placed</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                    <span className="text-slate-400">Listings</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-slate-400">Bids</span>
                  </div>
                </div>
              </div>

              <TrendAreaChart
                data={trends?.timeline || []}
                dataKey="listings"
                dataKey2="bids"
                label="Listings Created"
                label2="Bids Placed"
                color="#6366f1"
                color2="#10b981"
                height={220}
              />
            </div>

            {/* Chart 2: Daily Engagement (Views vs Bids) */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-600 text-slate-200 text-sm">Audience Engagement</h3>
                  <p className="text-slate-400 text-xs">Listing views compared with unique bidders</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                    <span className="text-slate-400">Views</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                    <span className="text-slate-400">Unique Bidders</span>
                  </div>
                </div>
              </div>

              <TrendAreaChart
                data={trends?.timeline || []}
                dataKey="views"
                dataKey2="uniqueBidders"
                label="Views"
                label2="Unique Bidders"
                color="#22d3ee"
                color2="#c084fc"
                height={220}
              />
            </div>

            {/* Chart 3: Starting Price vs Final Winning Bid Comparison */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div>
                <h3 className="font-600 text-slate-200 text-sm">Starting Price vs. Final Winning Bid</h3>
                <p className="text-slate-400 text-xs">Price appreciation across your completed auctions</p>
              </div>

              <ComparisonBarChart
                data={trends?.priceComparisons || []}
                key1="startingPrice"
                key2="finalPrice"
                label1="Starting Price (₹)"
                label2="Final Winning Bid (₹)"
                height={220}
              />
            </div>

            {/* Chart 4: Listing Status Distribution */}
            <div className="glass rounded-2xl p-5 flex flex-col gap-3 border border-white/8">
              <div>
                <h3 className="font-600 text-slate-200 text-sm">Listing Status Breakdown</h3>
                <p className="text-slate-400 text-xs">Distribution across active, scheduled, closed, and cancelled</p>
              </div>

              <StatusDistributionChart
                distribution={trends?.statusDistribution || {}}
                height={220}
              />
            </div>
          </div>

          {/* Individual Listing Analytics Table */}
          <div className="glass rounded-2xl p-6 flex flex-col gap-4 border border-white/8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-700 text-lg text-slate-100">Individual Listing Performance</h3>
                <p className="text-slate-400 text-xs">Detailed metrics, price growth, and bid velocity per item</p>
              </div>

              {/* Table search & status filter */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Search your listings…"
                    className="input pl-8 py-1.5 text-xs w-44 sm:w-56"
                  />
                </div>

                <select
                  value={tableStatus}
                  onChange={(e) => { setTableStatus(e.target.value); setTablePage(1); }}
                  className="input py-1.5 px-2.5 text-xs w-28"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="closed">Closed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-surface-800/80 uppercase tracking-wider text-[10px] text-slate-400 border-b border-white/5">
                  <tr>
                    <th className="py-3 px-3">Listing</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Start Price</th>
                    <th className="py-3 px-3">Current / Final</th>
                    <th className="py-3 px-3">Growth (%)</th>
                    <th className="py-3 px-3">Bids</th>
                    <th className="py-3 px-3">Unique Bidders</th>
                    <th className="py-3 px-3">Views</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {listingsData.listings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500">
                        No listings match your search or filters.
                      </td>
                    </tr>
                  ) : (
                    listingsData.listings.map((item) => {
                      const thumb = getImageUrl(item.images?.[0]);
                      const hasIncrease = item.priceIncreasePercent !== null && item.priceIncreasePercent > 0;

                      return (
                        <tr key={item._id} className="hover:bg-white/2 transition-colors">
                          <td className="py-3 px-3 flex items-center gap-2.5 min-w-[200px]">
                            <div className="w-10 h-10 rounded-lg bg-surface-700 shrink-0 overflow-hidden border border-white/5 flex items-center justify-center">
                              {thumb ? (
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                              ) : (
                                '📦'
                              )}
                            </div>
                            <div className="truncate">
                              <p className="font-600 text-slate-200 truncate max-w-[180px]">{item.title}</p>
                              <p className="text-[10px] text-slate-500">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`badge border capitalize text-[10px] ${
                              item.status === 'active' ? 'border-emerald-400/20 text-emerald-400 bg-emerald-400/10' :
                              item.status === 'scheduled' ? 'border-brand-400/20 text-brand-400 bg-brand-400/10' :
                              item.status === 'cancelled' ? 'border-rose-400/20 text-rose-400 bg-rose-400/10' :
                              'border-indigo-400/20 text-indigo-400 bg-indigo-400/10'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-500">
                            ₹{item.startingPrice?.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-700 text-slate-100">
                            ₹{item.currentPrice?.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-600">
                            {hasIncrease ? (
                              <span className="text-emerald-400">+{item.priceIncreasePercent}%</span>
                            ) : (
                              <span className="text-slate-500">0%</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap font-600 text-slate-200">
                            {item.bidCount}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-300">
                            {item.uniqueBiddersCount}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                            {item.viewsCount}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {(item.status === 'active' || item.status === 'scheduled' || item.status === 'draft') && (
                                <Link
                                  to={`/listings/${item._id}/edit`}
                                  className="btn btn-secondary btn-sm py-1 px-2.5 text-xs flex items-center gap-1 text-slate-300 hover:text-white hover:border-brand-400/40"
                                  title="Edit product"
                                >
                                  <Edit3 size={12} className="text-brand-400" /> Edit
                                </Link>
                              )}
                              <button
                                type="button"
                                onClick={() => openListingDetailModal(item._id)}
                                className="btn btn-secondary btn-sm py-1 px-2.5 text-xs text-brand-300 hover:text-brand-200"
                              >
                                Analytics →
                              </button>
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
            {listingsData.pages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400">
                <span>
                  Showing page {listingsData.page} of {listingsData.pages} ({listingsData.total} items)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={listingsData.page <= 1}
                    onClick={() => setTablePage((p) => Math.max(p - 1, 1))}
                    className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    disabled={listingsData.page >= listingsData.pages}
                    onClick={() => setTablePage((p) => p + 1)}
                    className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Deep-Dive Single Listing Analytics Modal */}
      {selectedListingId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass bg-surface-900 rounded-2xl max-w-2xl w-full p-6 border border-white/10 flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <h3 className="font-display font-700 text-lg text-slate-100 flex items-center gap-2">
                <TrendingUp size={18} className="text-brand-400" /> Listing Analytics Details
              </h3>
              <div className="flex items-center gap-2">
                {singleListingDetail?.listing && (singleListingDetail.listing.status === 'active' || singleListingDetail.listing.status === 'scheduled' || singleListingDetail.listing.status === 'draft') && (
                  <Link
                    to={`/listings/${singleListingDetail.listing._id}/edit`}
                    className="btn btn-secondary btn-sm py-1 px-2.5 text-xs flex items-center gap-1.5 text-brand-300 hover:text-brand-200"
                  >
                    <Edit3 size={13} /> Edit Product
                  </Link>
                )}
                <button
                  onClick={() => setSelectedListingId(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {loadingDetail || !singleListingDetail ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Loading detailed listing analytics…
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Header summary */}
                <div className="flex items-start gap-4 p-3 rounded-xl bg-surface-800/60 border border-white/5">
                  <div className="w-16 h-16 rounded-xl bg-surface-700 shrink-0 overflow-hidden">
                    {singleListingDetail.listing.images?.[0] ? (
                      <img
                        src={getImageUrl(singleListingDetail.listing.images[0])}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      '📦'
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-600 text-slate-100 truncate text-base">
                      {singleListingDetail.listing.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                      <span>Status: <strong className="text-slate-200 capitalize">{singleListingDetail.listing.status}</strong></span>
                      <span>·</span>
                      <span>Views: <strong className="text-cyan-300">{singleListingDetail.listing.viewsCount || 0}</strong></span>
                      <span>·</span>
                      <span>Bids: <strong className="text-brand-300">{singleListingDetail.listing.bidCount}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="glass rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Starting Price</p>
                    <p className="font-700 text-base text-slate-200 mt-0.5">
                      ₹{singleListingDetail.listing.startingPrice?.toLocaleString()}
                    </p>
                  </div>
                  <div className="glass rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Current / Final</p>
                    <p className="font-700 text-base text-emerald-400 mt-0.5">
                      ₹{singleListingDetail.listing.currentPrice?.toLocaleString()}
                    </p>
                  </div>
                  <div className="glass rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Price Increase</p>
                    <p className="font-700 text-base text-brand-300 mt-0.5">
                      +{singleListingDetail.listing.priceIncreasePercent || 0}%
                    </p>
                  </div>
                  <div className="glass rounded-xl p-3 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Unique Bidders</p>
                    <p className="font-700 text-base text-purple-400 mt-0.5">
                      {singleListingDetail.listing.uniqueBidders}
                    </p>
                  </div>
                </div>

                {/* Bid Growth Timeline */}
                <div>
                  <h5 className="font-600 text-slate-200 text-xs mb-2 uppercase tracking-wider">
                    Bid Progression History
                  </h5>
                  {singleListingDetail.bidTimeline?.length === 0 ? (
                    <div className="p-4 rounded-xl bg-surface-800/40 text-center text-slate-500 text-xs">
                      No bids placed on this auction yet.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
                      {singleListingDetail.bidTimeline.map((b, i) => (
                        <div
                          key={b._id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface-800/40 text-xs border border-white/5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-brand-500/20 text-brand-300 flex items-center justify-center font-700 text-[10px]">
                              {i + 1}
                            </span>
                            <span className="font-500 text-slate-200">@{b.bidder}</span>
                            {b.isLateBid && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300">
                                ⚡ 30s Extension
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="font-700 text-emerald-400">₹{b.amount?.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-500 ml-2">
                              {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Handover outcome if applicable */}
                {singleListingDetail.handover && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                    <p className="font-600 text-emerald-300">
                      Handover Status: {singleListingDetail.handover.status}
                    </p>
                    <p className="text-slate-400 mt-0.5">
                      Buyer: @{singleListingDetail.handover.buyer?.username} · Final Winning Price: ₹{singleListingDetail.handover.finalPrice?.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
