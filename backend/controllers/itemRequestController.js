const mongoose = require('mongoose');
const ItemRequest = require('../models/ItemRequest');

// POST /api/item-requests — Create request
exports.createRequest = async (req, res, next) => {
  try {
    const { title, category, description, budgetMin, budgetMax, neededBy } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Title is required for your item request.' });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ message: 'Description must be at least 10 characters describing what you need.' });
    }

    const min = budgetMin !== undefined && budgetMin !== '' ? Number(budgetMin) : null;
    const max = budgetMax !== undefined && budgetMax !== '' ? Number(budgetMax) : null;

    if (min !== null && isNaN(min)) return res.status(400).json({ message: 'Minimum budget must be a number.' });
    if (max !== null && isNaN(max)) return res.status(400).json({ message: 'Maximum budget must be a number.' });
    if (min !== null && max !== null && min > max) {
      return res.status(400).json({ message: 'Minimum budget cannot exceed maximum budget.' });
    }

    let parsedNeededBy = null;
    if (neededBy) {
      parsedNeededBy = new Date(neededBy);
      if (isNaN(parsedNeededBy.getTime())) {
        return res.status(400).json({ message: 'Invalid needed-by date.' });
      }
    }

    const itemRequest = await ItemRequest.create({
      requester: req.user._id,
      title: title.trim(),
      category: category || 'other',
      description: description.trim(),
      budgetMin: min,
      budgetMax: max,
      neededBy: parsedNeededBy,
      status: 'OPEN',
    });

    const populated = await ItemRequest.findById(itemRequest._id)
      .populate('requester', 'username avatarUrl campusId email');

    res.status(201).json({
      message: 'Item request posted to campus marketplace.',
      itemRequest: populated,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/item-requests — List requests
exports.getItemRequests = async (req, res, next) => {
  try {
    const { q, category, status = 'OPEN', page = 1, limit = 20 } = req.query;
    const filter = {};

    if (status && status !== 'ALL') {
      filter.status = status;
    }

    if (category && category !== 'ALL') {
      filter.category = category;
    }

    if (q && q.trim()) {
      filter.$text = { $search: q.trim() };
    }

    const itemRequests = await ItemRequest.find(filter)
      .populate('requester', 'username avatarUrl campusId email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await ItemRequest.countDocuments(filter);

    res.json({
      itemRequests,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/item-requests/:id — Single item request
exports.getItemRequest = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid item request ID format.' });
    }

    const itemRequest = await ItemRequest.findById(id)
      .populate('requester', 'username avatarUrl campusId email bio');

    if (!itemRequest) {
      return res.status(404).json({ message: 'Item request not found.' });
    }

    res.json({ itemRequest });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/item-requests/:id — Update request (owner only)
exports.updateItemRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, category, description, budgetMin, budgetMax, neededBy } = req.body;

    const itemRequest = await ItemRequest.findById(id);
    if (!itemRequest) {
      return res.status(404).json({ message: 'Item request not found.' });
    }

    if (itemRequest.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update your own item requests.' });
    }

    if (title && title.trim()) itemRequest.title = title.trim();
    if (category) itemRequest.category = category;
    if (description && description.trim()) itemRequest.description = description.trim();

    if (budgetMin !== undefined) itemRequest.budgetMin = budgetMin !== '' ? Number(budgetMin) : null;
    if (budgetMax !== undefined) itemRequest.budgetMax = budgetMax !== '' ? Number(budgetMax) : null;
    if (neededBy !== undefined) itemRequest.neededBy = neededBy ? new Date(neededBy) : null;

    await itemRequest.save();

    const updated = await ItemRequest.findById(id)
      .populate('requester', 'username avatarUrl campusId email');

    res.json({ message: 'Item request updated successfully.', itemRequest: updated });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/item-requests/:id/status — Mark fulfilled or cancelled (owner only)
exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['OPEN', 'FULFILLED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: 'Status must be OPEN, FULFILLED, or CANCELLED.' });
    }

    const itemRequest = await ItemRequest.findById(id);
    if (!itemRequest) {
      return res.status(404).json({ message: 'Item request not found.' });
    }

    if (itemRequest.requester.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only update the status of your own item request.' });
    }

    itemRequest.status = status;
    if (status === 'FULFILLED') {
      itemRequest.fulfilledAt = new Date();
    } else {
      itemRequest.fulfilledAt = null;
    }

    await itemRequest.save();

    res.json({ message: `Item request marked as ${status}.`, itemRequest });
  } catch (err) {
    next(err);
  }
};
