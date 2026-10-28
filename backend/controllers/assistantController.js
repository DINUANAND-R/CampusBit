const assistantService = require('../services/assistantService');

/**
 * Handle incoming assistant chat messages.
 * POST /api/assistant/chat
 * Body: { message: string, context?: object }
 */
exports.handleChat = async (req, res, next) => {
  try {
    const { message, context } = req.body;

    if (message === undefined || message === null) {
      return res.status(400).json({ message: 'The message field is required.' });
    }

    if (typeof message !== 'string') {
      return res.status(400).json({ message: 'The message field must be a string.' });
    }

    const response = await assistantService.processUserMessage(message, context || {}, req.user);
    return res.status(200).json(response);
  } catch (err) {
    next(err);
  }
};

/**
 * Handle explicit comparison of two listings.
 * POST /api/assistant/compare
 * Body: { listingIds: [id1, id2] }
 */
exports.compareListingsHttp = async (req, res, next) => {
  try {
    const { listingIds } = req.body;

    if (!Array.isArray(listingIds) || listingIds.length < 2) {
      return res.status(400).json({ message: 'Please provide at least 2 listing IDs to compare.' });
    }

    const response = await assistantService.compareListings(listingIds, req.user);
    return res.status(200).json(response);
  } catch (err) {
    next(err);
  }
};
