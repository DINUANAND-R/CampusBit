const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Handover = require('../models/Handover');

/**
 * Helper to compute date range from query params.
 */
function parseDateRange(query) {
  const { period = '30d', startDate, endDate } = query;
  const now = new Date();
  let start = new Date();

  if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e, period: 'custom' };
    }
  }

  switch (period) {
    case '7d':
      start.setDate(now.getDate() - 7);
      break;
    case '90d':
      start.setDate(now.getDate() - 90);
      break;
    case 'year':
      start.setFullYear(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date('2020-01-01');
      break;
    case '30d':
    default:
      start.setDate(now.getDate() - 30);
      break;
  }
  start.setHours(0, 0, 0, 0);
  return { start, end: now, period };
}

// GET /api/seller/analytics/overview
exports.getOverview = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { start, end, period } = parseDateRange(req.query);
    const now = new Date();

    // Fetch all listings for this seller
    const allSellerListings = await Listing.find({ seller: sellerId })
      .select('title startingPrice currentPrice status publishAt publishedAt endsAt winner images viewsCount createdAt')
      .lean();

    const totalListings = allSellerListings.length;
    const listingIds = allSellerListings.map((l) => l._id);

    // Active auctions
    const activeAuctions = allSellerListings.filter(
      (l) => l.status === 'active' && new Date(l.endsAt) > now
    ).length;

    // Scheduled / upcoming
    const scheduledListings = allSellerListings.filter((l) => l.status === 'scheduled').length;
    const upcomingAuctions = allSellerListings.filter(
      (l) => l.status === 'scheduled' || (l.status === 'active' && l.publishAt && new Date(l.publishAt) > now)
    ).length;

    // Closed auctions (including completed and unsold)
    const closedAuctions = allSellerListings.filter(
      (l) => l.status === 'closed' || l.status === 'completed' || l.status === 'unsold'
    ).length;

    // Cancelled listings
    const cancelledListings = allSellerListings.filter((l) => l.status === 'cancelled').length;

    // Completed with winner (successful auctions)
    const completedWithWinner = allSellerListings.filter(
      (l) => (l.status === 'closed' || l.status === 'completed') && l.winner
    );

    // Total winning bid value across successfully completed auctions (excludes cancelled)
    const totalWinningBidValue = completedWithWinner.reduce(
      (sum, l) => sum + (Number(l.currentPrice) || 0),
      0
    );

    // Average starting price
    const avgStartingPrice =
      totalListings > 0
        ? Math.round(
            (allSellerListings.reduce((sum, l) => sum + (Number(l.startingPrice) || 0), 0) /
              totalListings) *
              100
          ) / 100
        : 0;

    // Total views across all seller listings
    const totalViews = allSellerListings.reduce((sum, l) => sum + (Number(l.viewsCount) || 0), 0);

    // Bids aggregation across seller's listings
    const bidsStats = await Bid.aggregate([
      { $match: { listing: { $in: listingIds } } },
      {
        $group: {
          _id: null,
          totalBids: { $sum: 1 },
          uniqueBidders: { $addToSet: '$bidder' },
          listingsWithBids: { $addToSet: '$listing' },
        },
      },
    ]);

    const totalBids = bidsStats[0]?.totalBids || 0;
    const uniqueBidders = bidsStats[0]?.uniqueBidders?.length || 0;
    const listingsWithBidsCount = bidsStats[0]?.listingsWithBids?.length || 0;

    const avgBidsPerAuction =
      totalListings > 0 ? Math.round((totalBids / totalListings) * 10) / 10 : 0;

    // Auctions awaiting handover / seller approval
    const awaitingHandover = await Handover.countDocuments({
      seller: sellerId,
      status: { $in: ['PENDING', 'APPROVED'] },
    });

    // Per-listing bid stats for insights
    const perListingBids = await Bid.aggregate([
      { $match: { listing: { $in: listingIds } } },
      {
        $group: {
          _id: '$listing',
          count: { $sum: 1 },
          uniqueBidders: { $addToSet: '$bidder' },
          maxBid: { $max: '$amount' },
        },
      },
    ]);

    const bidMap = new Map();
    perListingBids.forEach((b) => {
      bidMap.set(b._id.toString(), {
        count: b.count,
        uniqueCount: b.uniqueBidders.length,
        maxBid: b.maxBid,
      });
    });

    // Build insights
    let mostBiddedListing = null;
    let mostUniqueBiddersListing = null;
    let highestPriceIncreaseListing = null;
    const zeroBidListings = [];

    allSellerListings.forEach((l) => {
      const stats = bidMap.get(l._id.toString()) || { count: 0, uniqueCount: 0 };

      if (stats.count === 0 && l.status !== 'cancelled' && l.status !== 'scheduled') {
        zeroBidListings.push({ _id: l._id, title: l.title, status: l.status });
      }

      if (!mostBiddedListing || stats.count > (mostBiddedListing.bidCount || 0)) {
        if (stats.count > 0) {
          mostBiddedListing = { _id: l._id, title: l.title, bidCount: stats.count, currentPrice: l.currentPrice };
        }
      }

      if (!mostUniqueBiddersListing || stats.uniqueCount > (mostUniqueBiddersListing.uniqueBidders || 0)) {
        if (stats.uniqueCount > 0) {
          mostUniqueBiddersListing = { _id: l._id, title: l.title, uniqueBidders: stats.uniqueCount };
        }
      }

      // Check price increase on items with bids
      if (l.startingPrice > 0 && l.currentPrice > l.startingPrice) {
        const increasePct = Math.round(((l.currentPrice - l.startingPrice) / l.startingPrice) * 100);
        if (!highestPriceIncreaseListing || increasePct > highestPriceIncreaseListing.increasePercent) {
          highestPriceIncreaseListing = {
            _id: l._id,
            title: l.title,
            startingPrice: l.startingPrice,
            finalPrice: l.currentPrice,
            increasePercent: increasePct,
          };
        }
      }
    });

    res.json({
      metrics: {
        totalListings,
        activeAuctions,
        upcomingAuctions,
        scheduledListings,
        closedAuctions,
        cancelledListings,
        completedWithWinner: completedWithWinner.length,
        totalBids,
        uniqueBidders,
        listingsWithBidsCount,
        avgBidsPerAuction,
        avgStartingPrice,
        totalWinningBidValue,
        awaitingHandover,
        totalViews,
      },
      insights: {
        mostBiddedListing,
        mostUniqueBiddersListing,
        highestPriceIncreaseListing,
        zeroBidCount: zeroBidListings.length,
      },
      filter: { period, start, end },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/seller/analytics/trends
exports.getTrends = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const { start, end, period } = parseDateRange(req.query);

    // 1. Listings created by day
    const listingsTimeline = await Listing.aggregate([
      {
        $match: {
          seller: sellerId,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          views: { $sum: '$viewsCount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2. Bids placed on seller's listings by day
    const sellerListings = await Listing.find({ seller: sellerId }).select('_id').lean();
    const listingIds = sellerListings.map((l) => l._id);

    const bidsTimeline = await Bid.aggregate([
      {
        $match: {
          listing: { $in: listingIds },
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
          uniqueBidders: { $addToSet: '$bidder' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Map into daily bucket array
    const dateMap = new Map();
    const cur = new Date(start);
    while (cur <= end) {
      const dStr = cur.toISOString().split('T')[0];
      dateMap.set(dStr, {
        date: dStr,
        listings: 0,
        bids: 0,
        views: 0,
        uniqueBidders: 0,
      });
      cur.setDate(cur.getDate() + 1);
    }

    listingsTimeline.forEach((l) => {
      if (dateMap.has(l._id)) {
        const item = dateMap.get(l._id);
        item.listings = l.count;
        item.views = l.views || 0;
      }
    });

    bidsTimeline.forEach((b) => {
      if (dateMap.has(b._id)) {
        const item = dateMap.get(b._id);
        item.bids = b.count;
        item.uniqueBidders = b.uniqueBidders?.length || 0;
      }
    });

    const timeline = Array.from(dateMap.values());

    // 3. Status distribution across seller's listings
    const statusAgg = await Listing.aggregate([
      { $match: { seller: sellerId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusDistribution = {
      active: 0,
      scheduled: 0,
      closed: 0,
      unsold: 0,
      completed: 0,
      cancelled: 0,
      draft: 0,
    };
    statusAgg.forEach((s) => {
      if (statusDistribution[s._id] !== undefined) {
        statusDistribution[s._id] = s.count;
      }
    });

    // 4. Starting price vs Winning bid for completed auctions
    const completedComparisons = await Listing.find({
      seller: sellerId,
      status: { $in: ['closed', 'completed'] },
      winner: { $ne: null },
    })
      .select('title startingPrice currentPrice createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    const priceComparisons = completedComparisons.map((c) => ({
      _id: c._id,
      title: c.title.length > 20 ? `${c.title.substring(0, 18)}…` : c.title,
      startingPrice: c.startingPrice,
      finalPrice: c.currentPrice,
      increasePercent:
        c.startingPrice > 0
          ? Math.round(((c.currentPrice - c.startingPrice) / c.startingPrice) * 100)
          : 0,
    }));

    res.json({
      timeline,
      statusDistribution,
      priceComparisons,
      period,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/seller/analytics/listings
exports.getListingsAnalytics = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const {
      page = 1,
      limit = 10,
      search,
      status,
      sort = 'createdAt_desc',
    } = req.query;

    const filter = { seller: sellerId };
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (search) {
      filter.title = { $regex: search.trim(), $options: 'i' };
    }

    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      price_desc: { currentPrice: -1 },
      price_asc: { currentPrice: 1 },
      views_desc: { viewsCount: -1 },
    };

    const listings = await Listing.find(filter)
      .sort(sortMap[sort] || sortMap.createdAt_desc)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('winner', 'username')
      .lean();

    const total = await Listing.countDocuments(filter);
    const listingIds = listings.map((l) => l._id);

    // Compute bids and unique bidder counts for each listing
    const bidAgg = await Bid.aggregate([
      { $match: { listing: { $in: listingIds } } },
      {
        $group: {
          _id: '$listing',
          bidCount: { $sum: 1 },
          uniqueBidders: { $addToSet: '$bidder' },
        },
      },
    ]);

    const bidDataMap = new Map();
    bidAgg.forEach((b) => {
      bidDataMap.set(b._id.toString(), {
        bidCount: b.bidCount,
        uniqueBiddersCount: b.uniqueBidders.length,
      });
    });

    const enriched = listings.map((l) => {
      const bInfo = bidDataMap.get(l._id.toString()) || { bidCount: 0, uniqueBiddersCount: 0 };
      const hasWinner = Boolean(l.winner);
      const isEnded = l.status === 'closed' || l.status === 'completed';

      let priceIncreasePercent = null;
      if (l.startingPrice > 0 && l.currentPrice >= l.startingPrice) {
        priceIncreasePercent =
          Math.round(((l.currentPrice - l.startingPrice) / l.startingPrice) * 1000) / 10;
      }

      return {
        _id: l._id,
        title: l.title,
        status: l.status,
        images: l.images,
        startingPrice: l.startingPrice,
        currentPrice: l.currentPrice,
        reservePrice: l.reservePrice,
        minBidIncrement: l.minBidIncrement,
        winner: l.winner,
        viewsCount: l.viewsCount || 0,
        bidCount: bInfo.bidCount,
        uniqueBiddersCount: bInfo.uniqueBiddersCount,
        priceIncreasePercent,
        hasWinner,
        isEnded,
        publishAt: l.publishAt,
        startAt: l.startAt,
        endsAt: l.endsAt,
        createdAt: l.createdAt,
      };
    });

    res.json({
      listings: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/seller/analytics/listings/:listingId
exports.getSingleListingAnalytics = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.listingId)
      .populate('seller', 'username')
      .populate('winner', 'username')
      .lean();

    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    // Strict ownership verification
    if (listing.seller._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized access to listing analytics' });
    }

    // Retrieve all bids with bidder details
    const bids = await Bid.find({ listing: listing._id })
      .sort({ createdAt: 1 })
      .populate('bidder', 'username')
      .lean();

    const uniqueBidders = new Set(bids.map((b) => b.bidder?._id?.toString())).size;

    // Build bid growth timeline
    const bidTimeline = bids.map((b) => ({
      _id: b._id,
      amount: b.amount,
      bidder: b.bidder?.username || 'Anonymous',
      createdAt: b.createdAt,
      isLateBid: b.isLateBid,
    }));

    // Handover status if closed
    let handover = null;
    if (listing.status === 'closed' || listing.status === 'completed') {
      handover = await Handover.findOne({ listing: listing._id })
        .populate('buyer', 'username')
        .lean();
    }

    let priceIncreasePercent = null;
    if (listing.startingPrice > 0) {
      priceIncreasePercent =
        Math.round(((listing.currentPrice - listing.startingPrice) / listing.startingPrice) * 1000) / 10;
    }

    res.json({
      listing: {
        ...listing,
        uniqueBidders,
        bidCount: bids.length,
        priceIncreasePercent,
      },
      bidTimeline,
      handover,
    });
  } catch (err) {
    next(err);
  }
};
