const WantedAlert = require('../models/WantedAlert');
const WantedAlertMatch = require('../models/WantedAlertMatch');
const { expireOverdueAlerts } = require('../services/wantedAlertService');

const VALID_CATEGORIES = ['all', 'books', 'electronics', 'clothing', 'furniture', 'sports', 'other'];
const VALID_CONDITIONS = ['any', 'new', 'like-new', 'good', 'fair'];

// POST /api/wanted-alerts
exports.createAlert = async (req, res, next) => {
  try {
    const {
      keywords,
      description = '',
      category = 'all',
      maxBudget,
      condition = 'any',
      durationDays = 30,
    } = req.body;

    if (!keywords || typeof keywords !== 'string' || !keywords.trim()) {
      return res.status(400).json({ message: 'Item keywords or name is required' });
    }

    if (keywords.trim().length < 2) {
      return res.status(400).json({ message: 'Keywords must be at least 2 characters' });
    }

    const budgetNum = Number(maxBudget);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      return res.status(400).json({ message: 'Maximum budget must be a positive number' });
    }

    const cleanCategory = (category || 'all').toLowerCase().trim();
    if (!VALID_CATEGORIES.includes(cleanCategory)) {
      return res.status(400).json({ message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const cleanCondition = (condition || 'any').toLowerCase().trim();
    if (!VALID_CONDITIONS.includes(cleanCondition)) {
      return res.status(400).json({ message: `Condition must be one of: ${VALID_CONDITIONS.join(', ')}` });
    }

    const days = Math.min(Math.max(Number(durationDays) || 30, 1), 180);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const alert = await WantedAlert.create({
      user: req.user._id,
      keywords: keywords.trim(),
      description: description.trim(),
      category: cleanCategory,
      maxBudget: budgetNum,
      condition: cleanCondition,
      status: 'ACTIVE',
      expiresAt,
    });

    res.status(201).json({ alert });
  } catch (err) {
    next(err);
  }
};

// GET /api/wanted-alerts
exports.getMyAlerts = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    // Housekeeping: mark overdue alerts as EXPIRED
    await expireOverdueAlerts();

    const filter = { user: userId };
    if (status && status !== 'all') {
      filter.status = status.toUpperCase();
    }

    const alerts = await WantedAlert.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await WantedAlert.countDocuments(filter);

    res.json({
      alerts,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/wanted-alerts/:id
exports.getAlert = async (req, res, next) => {
  try {
    const alert = await WantedAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Wanted alert not found' });
    }

    // Ownership check
    if (alert.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not your alert' });
    }

    // Auto-check expiration
    if (alert.status === 'ACTIVE' && alert.expiresAt <= new Date()) {
      alert.status = 'EXPIRED';
      await alert.save();
    }

    // Fetch recent matched listings for this alert
    const matches = await WantedAlertMatch.find({ alert: alert._id })
      .populate('listing', 'title images startingPrice currentPrice status endsAt category seller')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ alert, matches });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/wanted-alerts/:id
exports.updateAlert = async (req, res, next) => {
  try {
    const alert = await WantedAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Wanted alert not found' });
    }

    if (alert.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not your alert' });
    }

    const { keywords, description, category, maxBudget, condition, durationDays, extendDays } = req.body;

    if (keywords !== undefined) {
      if (typeof keywords !== 'string' || !keywords.trim()) {
        return res.status(400).json({ message: 'Keywords cannot be empty' });
      }
      alert.keywords = keywords.trim();
    }

    if (description !== undefined) {
      alert.description = String(description).trim();
    }

    if (category !== undefined) {
      const cleanCat = String(category).toLowerCase().trim();
      if (!VALID_CATEGORIES.includes(cleanCat)) {
        return res.status(400).json({ message: `Invalid category: ${category}` });
      }
      alert.category = cleanCat;
    }

    if (maxBudget !== undefined) {
      const budgetNum = Number(maxBudget);
      if (isNaN(budgetNum) || budgetNum <= 0) {
        return res.status(400).json({ message: 'Budget must be a positive number' });
      }
      alert.maxBudget = budgetNum;
    }

    if (condition !== undefined) {
      const cleanCond = String(condition).toLowerCase().trim();
      if (!VALID_CONDITIONS.includes(cleanCond)) {
        return res.status(400).json({ message: `Invalid condition: ${condition}` });
      }
      alert.condition = cleanCond;
    }

    if (extendDays || durationDays) {
      const days = Number(extendDays || durationDays);
      if (days > 0) {
        const baseDate = alert.expiresAt > new Date() ? alert.expiresAt : new Date();
        alert.expiresAt = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
        if (alert.status === 'EXPIRED') {
          alert.status = 'ACTIVE';
        }
      }
    }

    await alert.save();
    res.json({ alert });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/wanted-alerts/:id/status
exports.updateAlertStatus = async (req, res, next) => {
  try {
    const alert = await WantedAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Wanted alert not found' });
    }

    if (alert.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not your alert' });
    }

    const { status, extendDays } = req.body;

    if (extendDays) {
      const days = Number(extendDays);
      const base = alert.expiresAt > new Date() ? alert.expiresAt : new Date();
      alert.expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
      alert.status = 'ACTIVE';
    } else if (status) {
      const upper = status.toUpperCase();
      if (!['ACTIVE', 'PAUSED'].includes(upper)) {
        return res.status(400).json({ message: 'Status must be ACTIVE or PAUSED' });
      }

      if (upper === 'ACTIVE' && alert.expiresAt <= new Date()) {
        return res.status(400).json({ message: 'Cannot activate an expired alert; please extend its duration first' });
      }

      alert.status = upper;
    }

    await alert.save();
    res.json({ alert });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/wanted-alerts/:id
exports.deleteAlert = async (req, res, next) => {
  try {
    const alert = await WantedAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Wanted alert not found' });
    }

    if (alert.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not your alert' });
    }

    await WantedAlert.deleteOne({ _id: alert._id });
    await WantedAlertMatch.deleteMany({ alert: alert._id });

    res.json({ message: 'Wanted alert deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// GET /api/wanted-alerts/:id/matches
exports.getAlertMatches = async (req, res, next) => {
  try {
    const alert = await WantedAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Wanted alert not found' });
    }

    if (alert.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: not your alert' });
    }

    const matches = await WantedAlertMatch.find({ alert: alert._id })
      .populate({
        path: 'listing',
        select: 'title images startingPrice currentPrice status endsAt startAt category seller',
        populate: { path: 'seller', select: 'username avatarUrl' },
      })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ matches });
  } catch (err) {
    next(err);
  }
};
