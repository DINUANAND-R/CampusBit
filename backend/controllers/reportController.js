const Report = require('../models/Report');
const Listing = require('../models/Listing');
const User = require('../models/User');

// POST /api/reports — User submits a report
exports.createReport = async (req, res, next) => {
  try {
    const { targetType, targetId, category, description } = req.body;

    if (!targetType || !targetId || !category || !description?.trim()) {
      return res.status(400).json({ message: 'Target type, target ID, category, and description are required.' });
    }

    if (!['listing', 'user'].includes(targetType)) {
      return res.status(400).json({ message: 'Target type must be either listing or user.' });
    }

    // Verify target exists
    if (targetType === 'listing') {
      const listing = await Listing.findById(targetId);
      if (!listing) return res.status(404).json({ message: 'Reported listing not found.' });
      if (listing.seller.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'You cannot report your own listing.' });
      }
    } else {
      const user = await User.findById(targetId);
      if (!user) return res.status(404).json({ message: 'Reported user not found.' });
      if (user._id.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: 'You cannot report yourself.' });
      }
    }

    // Prevent duplicate pending reports from same user on same target
    const existingPending = await Report.findOne({
      reporter: req.user._id,
      targetType,
      ...(targetType === 'listing' ? { targetListing: targetId } : { targetUser: targetId }),
      status: { $in: ['PENDING', 'UNDER_REVIEW'] },
    });

    if (existingPending) {
      return res.status(400).json({
        message: 'You already have a pending report for this item or user under review.',
      });
    }

    const report = await Report.create({
      reporter: req.user._id,
      targetType,
      targetListing: targetType === 'listing' ? targetId : null,
      targetUser: targetType === 'user' ? targetId : null,
      category,
      description: description.trim(),
    });

    res.status(201).json({
      message: 'Report submitted successfully. Our moderation team will review it.',
      report,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports/my — Current user's submitted reports
exports.getMyReports = async (req, res, next) => {
  try {
    const reports = await Report.find({ reporter: req.user._id })
      .populate('targetListing', 'title status images')
      .populate('targetUser', 'username')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ reports });
  } catch (err) {
    next(err);
  }
};
