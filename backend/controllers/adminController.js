const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Handover = require('../models/Handover');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');

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

// GET /api/admin/overview
exports.getOverview = async (req, res, next) => {
  try {
    const { start, end, period } = parseDateRange(req.query);
    const now = new Date();

    const [
      totalUsers,
      newUsersPeriod,
      suspendedUsers,
      totalListings,
      activeAuctions,
      upcomingAuctions,
      scheduledListings,
      closedAuctions,
      cancelledListings,
      moderatedListings,
      totalBids,
      awaitingHandover,
      pendingReports,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      User.countDocuments({ status: { $in: ['suspended', 'banned'] } }),
      Listing.countDocuments(),
      Listing.countDocuments({ status: 'active', isModerated: { $ne: true }, endsAt: { $gt: now } }),
      Listing.countDocuments({
        $or: [{ status: 'scheduled' }, { status: 'active', publishAt: { $gt: now } }],
        isModerated: { $ne: true },
      }),
      Listing.countDocuments({ status: 'scheduled' }),
      Listing.countDocuments({ status: { $in: ['closed', 'completed', 'unsold'] } }),
      Listing.countDocuments({ status: 'cancelled' }),
      Listing.countDocuments({ isModerated: true }),
      Bid.countDocuments(),
      Handover.countDocuments({ status: { $in: ['PENDING', 'APPROVED'] } }),
      Report.countDocuments({ status: { $in: ['PENDING', 'UNDER_REVIEW'] } }),
    ]);

    // Trend lines for selected period: registrations, listings, bids, completed
    const [regAgg, listAgg, bidAgg, closedAgg] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Bid.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Listing.aggregate([
        {
          $match: {
            status: { $in: ['closed', 'completed'] },
            updatedAt: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Map into unified timeline
    const dateMap = new Map();
    const cur = new Date(start);
    while (cur <= end) {
      const dStr = cur.toISOString().split('T')[0];
      dateMap.set(dStr, { date: dStr, users: 0, listings: 0, bids: 0, closed: 0 });
      cur.setDate(cur.getDate() + 1);
    }

    regAgg.forEach((r) => { if (dateMap.has(r._id)) dateMap.get(r._id).users = r.count; });
    listAgg.forEach((l) => { if (dateMap.has(l._id)) dateMap.get(l._id).listings = l.count; });
    bidAgg.forEach((b) => { if (dateMap.has(b._id)) dateMap.get(b._id).bids = b.count; });
    closedAgg.forEach((c) => { if (dateMap.has(c._id)) dateMap.get(c._id).closed = c.count; });

    const timeline = Array.from(dateMap.values());

    // Recent activity feeds
    const [recentUsers, recentListings, recentClosed, recentReports, recentModeration] =
      await Promise.all([
        User.find().select('username email role status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
        Listing.find().select('title seller status currentPrice createdAt images').populate('seller', 'username').sort({ createdAt: -1 }).limit(5).lean(),
        Listing.find({ status: { $in: ['closed', 'completed'] } }).select('title seller winner currentPrice updatedAt').populate('seller', 'username').populate('winner', 'username').sort({ updatedAt: -1 }).limit(5).lean(),
        Report.find().populate('reporter', 'username').populate('targetListing', 'title').populate('targetUser', 'username').sort({ createdAt: -1 }).limit(5).lean(),
        AuditLog.find().populate('admin', 'username').sort({ createdAt: -1 }).limit(5).lean(),
      ]);

    res.json({
      metrics: {
        totalUsers,
        newUsersPeriod,
        suspendedUsers,
        totalListings,
        activeAuctions,
        upcomingAuctions,
        scheduledListings,
        closedAuctions,
        cancelledListings,
        moderatedListings,
        totalBids,
        awaitingHandover,
        pendingReports,
      },
      timeline,
      recentActivity: {
        recentUsers,
        recentListings,
        recentClosed,
        recentReports,
        recentModeration,
      },
      filter: { period, start, end },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role, status, sort = 'createdAt_desc' } = req.query;
    const filter = {};

    if (role && role !== 'all') filter.role = role;
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { username: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } },
        { campusId: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      username_asc: { username: 1 },
    };

    const users = await User.find(filter)
      .select('username email role campusId status suspensionReason suspendedAt createdAt')
      .sort(sortMap[sort] || sortMap.createdAt_desc)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await User.countDocuments(filter);
    const userIds = users.map((u) => u._id);

    // Compute listings and bids count for each user
    const [listingCounts, bidCounts] = await Promise.all([
      Listing.aggregate([
        { $match: { seller: { $in: userIds } } },
        { $group: { _id: '$seller', count: { $sum: 1 } } },
      ]),
      Bid.aggregate([
        { $match: { bidder: { $in: userIds } } },
        { $group: { _id: '$bidder', count: { $sum: 1 } } },
      ]),
    ]);

    const lMap = new Map(listingCounts.map((l) => [l._id.toString(), l.count]));
    const bMap = new Map(bidCounts.map((b) => [b._id.toString(), b.count]));

    const enriched = users.map((u) => ({
      ...u,
      listingsCount: lMap.get(u._id.toString()) || 0,
      bidsCount: bMap.get(u._id.toString()) || 0,
    }));

    res.json({
      users: enriched,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/:id
exports.getUserDetail = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username email role campusId status suspensionReason suspendedAt bio avatarUrl createdAt')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const [userListings, userBids, auditHistory, reportsAgainst] = await Promise.all([
      Listing.find({ seller: user._id }).select('title status currentPrice createdAt').sort({ createdAt: -1 }).limit(10).lean(),
      Bid.find({ bidder: user._id }).populate('listing', 'title').sort({ createdAt: -1 }).limit(10).lean(),
      AuditLog.find({ targetId: user._id.toString(), targetType: 'user' }).populate('admin', 'username').sort({ createdAt: -1 }).lean(),
      Report.find({ targetUser: user._id }).populate('reporter', 'username').sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      user,
      listings: userListings,
      bids: userBids,
      auditHistory,
      reportsAgainst,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/status
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    // Safety rule: Admin cannot suspend/ban themselves
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot suspend or ban your own administrative account.' });
    }

    if (!['suspend', 'reinstate', 'ban'].includes(action)) {
      return res.status(400).json({ message: 'Action must be suspend, reinstate, or ban.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A moderation reason is required.' });
    }

    let newStatus = 'active';
    let auditAction = 'REINSTATE_USER';

    if (action === 'suspend') {
      newStatus = 'suspended';
      auditAction = 'SUSPEND_USER';
    } else if (action === 'ban') {
      newStatus = 'banned';
      auditAction = 'BAN_USER';
    }

    targetUser.status = newStatus;
    targetUser.suspensionReason = newStatus === 'active' ? '' : reason.trim();
    targetUser.suspendedAt = newStatus === 'active' ? null : new Date();
    targetUser.suspendedBy = newStatus === 'active' ? null : req.user._id;

    await targetUser.save();

    // Record audit log
    await AuditLog.create({
      admin: req.user._id,
      action: auditAction,
      targetType: 'user',
      targetId: targetUser._id.toString(),
      targetName: `@${targetUser.username}`,
      reason: reason.trim(),
      details: { previousStatus: targetUser.status, newStatus },
    });

    res.json({
      message: `User @${targetUser.username} status updated to ${newStatus}.`,
      user: targetUser,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/role
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role, reason } = req.body;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    if (!['student', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Role must be student or admin.' });
    }

    // Safety rule: Prevent admin from removing their own admin access if they are the last admin
    if (targetUser._id.toString() === req.user._id.toString() && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot demote the last remaining administrator.' });
      }
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save();

    await AuditLog.create({
      admin: req.user._id,
      action: 'CHANGE_ROLE',
      targetType: 'user',
      targetId: targetUser._id.toString(),
      targetName: `@${targetUser.username}`,
      reason: reason?.trim() || 'Role modification by admin',
      details: { previousRole, newRole: role },
    });

    res.json({
      message: `User @${targetUser.username} role updated to ${role}.`,
      user: targetUser,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/listings
exports.getListings = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      category,
      isModerated,
      sort = 'createdAt_desc',
    } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;
    if (isModerated === 'true') filter.isModerated = true;
    if (isModerated === 'false') filter.isModerated = { $ne: true };

    if (search) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
      ];
      if (mongoose.Types.ObjectId.isValid(search.trim())) {
        filter.$or.push({ _id: search.trim() });
      }
    }

    const sortMap = {
      createdAt_desc: { createdAt: -1 },
      createdAt_asc: { createdAt: 1 },
      price_desc: { currentPrice: -1 },
      price_asc: { currentPrice: 1 },
    };

    const listings = await Listing.find(filter)
      .populate('seller', 'username email')
      .populate('winner', 'username')
      .sort(sortMap[sort] || sortMap.createdAt_desc)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Listing.countDocuments(filter);
    const listingIds = listings.map((l) => l._id);

    // Get bid counts for these listings
    const bidCounts = await Bid.aggregate([
      { $match: { listing: { $in: listingIds } } },
      { $group: { _id: '$listing', count: { $sum: 1 } } },
    ]);

    const bMap = new Map(bidCounts.map((b) => [b._id.toString(), b.count]));

    const enriched = listings.map((l) => ({
      ...l,
      bidCount: bMap.get(l._id.toString()) || 0,
    }));

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

// PATCH /api/admin/listings/:id/moderate
exports.moderateListing = async (req, res, next) => {
  try {
    const { action, reason } = req.body;
    const listing = await Listing.findById(req.params.id);

    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    if (!['hide', 'restore'].includes(action)) {
      return res.status(400).json({ message: 'Action must be hide or restore.' });
    }

    if (action === 'hide' && (!reason || !reason.trim())) {
      return res.status(400).json({ message: 'A moderation reason is required to hide a listing.' });
    }

    const isHiding = action === 'hide';
    listing.isModerated = isHiding;
    listing.moderationReason = isHiding ? reason.trim() : '';
    listing.moderatedAt = isHiding ? new Date() : null;
    listing.moderatedBy = isHiding ? req.user._id : null;

    await listing.save();

    await AuditLog.create({
      admin: req.user._id,
      action: isHiding ? 'MODERATE_LISTING' : 'RESTORE_LISTING',
      targetType: 'listing',
      targetId: listing._id.toString(),
      targetName: listing.title,
      reason: reason?.trim() || (isHiding ? 'Moderated by admin' : 'Restored by admin'),
      details: { isModerated: isHiding },
    });

    // Broadcast status change via Socket.IO if hidden
    const io = req.app.get('io');
    if (io && isHiding) {
      io.to(`auction:${listing._id}`).emit('auction:status_change', {
        listingId: listing._id,
        status: 'cancelled',
        reason: 'Listing moderated by admin',
      });
    }

    res.json({
      message: `Listing "${listing.title}" ${isHiding ? 'hidden and moderated' : 'restored'}.`,
      listing,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/reports
exports.getReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, category } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;

    const reports = await Report.find(filter)
      .populate('reporter', 'username email')
      .populate('targetListing', 'title status seller images')
      .populate('targetUser', 'username email status')
      .populate('internalNotes.admin', 'username')
      .populate('resolvedBy', 'username')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await Report.countDocuments(filter);

    res.json({
      reports,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/reports/:id
exports.updateReport = async (req, res, next) => {
  try {
    const { status, internalNote, actionTaken } = req.body;
    const report = await Report.findById(req.params.id);

    if (!report) return res.status(404).json({ message: 'Report not found' });

    if (status) {
      if (!['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'].includes(status)) {
        return res.status(400).json({ message: 'Invalid report status.' });
      }
      report.status = status;
      if (status === 'RESOLVED' || status === 'DISMISSED') {
        report.resolvedAt = new Date();
        report.resolvedBy = req.user._id;
      }
    }

    if (internalNote && internalNote.trim()) {
      report.internalNotes.push({
        note: internalNote.trim(),
        admin: req.user._id,
        createdAt: new Date(),
      });
    }

    if (actionTaken !== undefined) {
      report.actionTaken = actionTaken.trim();
    }

    await report.save();

    await AuditLog.create({
      admin: req.user._id,
      action: report.status === 'DISMISSED' ? 'DISMISS_REPORT' : 'RESOLVE_REPORT',
      targetType: 'report',
      targetId: report._id.toString(),
      targetName: `Report #${report._id}`,
      reason: internalNote?.trim() || actionTaken?.trim() || `Status updated to ${report.status}`,
      details: { status: report.status, actionTaken: report.actionTaken },
    });

    res.json({ message: 'Report updated successfully.', report });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/analytics
exports.getAnalytics = async (req, res, next) => {
  try {
    const { start, end, period } = parseDateRange(req.query);

    // 1. Total counts for calculation rates
    const [allListings, dueListings, closedWithWinner, cancelledListings, allBids] =
      await Promise.all([
        Listing.find({ createdAt: { $gte: start, $lte: end } }).select('status currentPrice startingPrice winner category').lean(),
        Listing.find({ endsAt: { $gte: start, $lte: end }, status: { $ne: 'scheduled' } }).select('status winner').lean(),
        Listing.find({ status: { $in: ['closed', 'completed'] }, winner: { $ne: null } }).select('currentPrice').lean(),
        Listing.countDocuments({ status: 'cancelled', createdAt: { $gte: start, $lte: end } }),
        Bid.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      ]);

    const totalPeriodListings = allListings.length;

    // Auction completion rate: eligible auctions closed normally ÷ eligible auctions due to close × 100
    // eligible auctions = those due to close in period that are not cancelled by seller
    const eligibleDueToClose = dueListings.filter((l) => l.status !== 'cancelled').length;
    const completedNormally = dueListings.filter((l) => l.status === 'closed' || l.status === 'completed' || l.status === 'unsold').length;

    const auctionCompletionRate =
      eligibleDueToClose > 0 ? Math.round((completedNormally / eligibleDueToClose) * 1000) / 10 : 0;

    // Cancellation rate
    const cancellationRate =
      totalPeriodListings > 0 ? Math.round((cancelledListings / totalPeriodListings) * 1000) / 10 : 0;

    // Percentage of auctions receiving at least one bid
    const listingsWithBids = await Bid.distinct('listing', { createdAt: { $gte: start, $lte: end } });
    const nonCancelledListings = allListings.filter((l) => l.status !== 'cancelled').length;

    const percentWithBids =
      nonCancelledListings > 0
        ? Math.round((listingsWithBids.length / nonCancelledListings) * 1000) / 10
        : 0;

    // Average valid bids per auction
    const avgBidsPerAuction =
      totalPeriodListings > 0 ? Math.round((allBids / totalPeriodListings) * 10) / 10 : 0;

    // Average winning bid across closed auctions with winners
    const avgWinningBid =
      closedWithWinner.length > 0
        ? Math.round(
            closedWithWinner.reduce((sum, l) => sum + (Number(l.currentPrice) || 0), 0) /
              closedWithWinner.length
          )
        : 0;

    // Category popularity breakdown
    const categoryPopularity = await Listing.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$category',
          listingsCount: { $sum: 1 },
          avgStartPrice: { $avg: '$startingPrice' },
        },
      },
      { $sort: { listingsCount: -1 } },
    ]);

    // Report status distribution
    const reportStats = await Report.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const reportStatusMap = { PENDING: 0, UNDER_REVIEW: 0, RESOLVED: 0, DISMISSED: 0 };
    reportStats.forEach((r) => { if (reportStatusMap[r._id] !== undefined) reportStatusMap[r._id] = r.count; });

    res.json({
      metrics: {
        auctionCompletionRate,
        cancellationRate,
        percentWithBids,
        avgBidsPerAuction,
        avgWinningBid,
        totalPeriodListings,
        eligibleDueToClose,
        completedNormally,
        closedWithWinnerCount: closedWithWinner.length,
      },
      categoryPopularity: categoryPopularity.map((c) => ({
        category: c._id || 'other',
        listingsCount: c.listingsCount,
        avgStartPrice: Math.round(c.avgStartPrice || 0),
      })),
      reportStatusMap,
      filter: { period, start, end },
    });
  } catch (err) {
    next(err);
  }
};
