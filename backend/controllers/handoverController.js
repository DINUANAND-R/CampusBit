const Handover = require('../models/Handover');
const Listing = require('../models/Listing');
const crypto = require('crypto');

// POST /api/handover/:listingId/approve  (seller)
exports.approve = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only seller can approve' });
    }
    if (listing.status !== 'closed') {
      return res.status(400).json({ message: 'Listing is not closed' });
    }

    let handover = await Handover.findOne({ listing: listing._id });
    if (!handover) return res.status(404).json({ message: 'Handover record not found' });
    if (handover.sellerDecision !== 'pending') {
      return res.status(400).json({ message: `Already ${handover.sellerDecision}` });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    handover.sellerDecision = 'approved';
    handover.handoverCode = code;
    await handover.save();

    res.json({ message: 'Approved', handoverCode: code, handover });
  } catch (err) {
    next(err);
  }
};

// POST /api/handover/:listingId/reject  (seller)
exports.reject = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only seller can reject' });
    }
    if (listing.status !== 'closed') {
      return res.status(400).json({ message: 'Listing is not closed' });
    }

    let handover = await Handover.findOne({ listing: listing._id });
    if (!handover) return res.status(404).json({ message: 'Handover record not found' });
    if (handover.sellerDecision !== 'pending') {
      return res.status(400).json({ message: `Already ${handover.sellerDecision}` });
    }

    handover.sellerDecision = 'rejected';
    handover.rejectionReason = req.body.reason || '';
    await handover.save();

    // Mark listing as unsold
    listing.status = 'unsold';
    await listing.save();

    res.json({ message: 'Rejected', handover });
  } catch (err) {
    next(err);
  }
};

// POST /api/handover/:listingId/confirm  (buyer with OTP)
exports.confirm = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    let handover = await Handover.findOne({ listing: listing._id });
    if (!handover) return res.status(404).json({ message: 'Handover record not found' });
    if (handover.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the winner can confirm handover' });
    }
    if (handover.sellerDecision !== 'approved') {
      return res.status(400).json({ message: 'Seller has not approved yet' });
    }
    if (handover.completedAt) {
      return res.status(400).json({ message: 'Handover already completed' });
    }

    const { code } = req.body;
    if (!code || code.toString() !== handover.handoverCode) {
      return res.status(400).json({ message: 'Invalid handover code' });
    }

    handover.completedAt = new Date();
    await handover.save();

    listing.status = 'completed';
    await listing.save();

    res.json({ message: 'Handover complete!', handover });
  } catch (err) {
    next(err);
  }
};

// GET /api/handover/:listingId
exports.getHandover = async (req, res, next) => {
  try {
    const handover = await Handover.findOne({ listing: req.params.listingId })
      .populate('seller', 'username')
      .populate('buyer', 'username');
    if (!handover) return res.status(404).json({ message: 'No handover record' });

    // Hide code from buyer — only show after approval & only to seller
    const isSeller = handover.seller._id.toString() === req.user._id.toString();
    const data = handover.toObject();
    if (!isSeller) delete data.handoverCode;

    res.json({ handover: data });
  } catch (err) {
    next(err);
  }
};
