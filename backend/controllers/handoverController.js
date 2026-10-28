const Handover = require('../models/Handover');
const Listing = require('../models/Listing');
const Exchange = require('../models/Exchange');
const crypto = require('crypto');

// POST /api/handover/:listingId/approve  (seller)
exports.approve = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.listingId);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (listing.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only seller can approve' });
    }
    if (listing.status !== 'closed' && listing.status !== 'completed') {
      return res.status(400).json({ message: `Listing is ${listing.status}, not closed` });
    }

    let handover = await Handover.findOne({ listing: listing._id });
    if (!handover && listing.winner) {
      handover = await Handover.create({
        listing: listing._id,
        seller: listing.seller,
        buyer: listing.winner,
        finalPrice: listing.currentPrice,
      });
    }
    if (!handover) return res.status(404).json({ message: 'Handover record not found' });
    if (handover.sellerDecision !== 'pending') {
      return res.status(400).json({ message: `Already ${handover.sellerDecision}` });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    handover.sellerDecision = 'approved';
    handover.handoverCode = code;
    await handover.save();

    await handover.populate('seller', 'username');
    await handover.populate('buyer', 'username');

    // Notify buyer via socket
    const io = req.app.get('io');
    if (io) {
      const buyerId = handover.buyer?._id || handover.buyer;
      io.to(`user:${buyerId}`).emit('handover:approved', {
        listingId: listing._id,
        handoverId: handover._id,
      });
    }

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

    // Cancel exchange if open
    await Exchange.updateOne(
      { listing: listing._id },
      {
        status: 'CANCELLED',
        $push: {
          history: {
            actor: req.user._id,
            action: 'EXCHANGE_CANCELLED_SELLER_REJECTED',
            timestamp: new Date(),
            note: req.body.reason || 'Seller rejected handover',
          },
        },
      }
    ).catch(() => {});

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

    const now = new Date();
    handover.completedAt = now;
    await handover.save();

    listing.status = 'completed';
    await listing.save();

    // Synchronize with rich Exchange model
    await Exchange.updateOne(
      { listing: listing._id },
      {
        status: 'COMPLETED',
        sellerHandedOverAt: now,
        buyerReceivedAt: now,
        completedAt: now,
        $push: {
          history: {
            actor: req.user._id,
            action: 'HANDOVER_COMPLETED_VIA_OTP',
            timestamp: now,
            note: 'Handover successfully verified and completed via 6-digit OTP code',
          },
        },
      }
    ).catch(() => {});

    await handover.populate('seller', 'username');
    await handover.populate('buyer', 'username');

    // Notify seller via socket
    const io = req.app.get('io');
    if (io) {
      const sellerId = handover.seller?._id || handover.seller;
      io.to(`user:${sellerId}`).emit('handover:completed', {
        listingId: listing._id,
        handoverId: handover._id,
      });
    }

    res.json({ message: 'Handover complete!', handover });
  } catch (err) {
    next(err);
  }
};

// GET /api/handover/:listingId
exports.getHandover = async (req, res, next) => {
  try {
    let handover = await Handover.findOne({ listing: req.params.listingId })
      .populate('seller', 'username')
      .populate('buyer', 'username');

    // If missing but listing has a winner and is closed/completed, auto-create
    if (!handover) {
      const listing = await Listing.findById(req.params.listingId)
        .populate('seller', 'username')
        .populate('winner', 'username');
      if (listing && listing.winner && (listing.status === 'closed' || listing.status === 'completed')) {
        handover = await Handover.create({
          listing: listing._id,
          seller: listing.seller._id || listing.seller,
          buyer: listing.winner._id || listing.winner,
          finalPrice: listing.currentPrice,
          sellerDecision: listing.status === 'completed' ? 'approved' : 'pending',
          completedAt: listing.status === 'completed' ? new Date() : null,
        });
        handover = await Handover.findById(handover._id)
          .populate('seller', 'username')
          .populate('buyer', 'username');
      }
    }

    if (!handover) return res.status(404).json({ message: 'No handover record found for this listing' });

    // Hide code from buyer — only show after approval & only to seller
    const isSeller = handover.seller._id.toString() === req.user._id.toString();
    const data = handover.toObject();
    if (!isSeller) delete data.handoverCode;

    res.json({ handover: data });
  } catch (err) {
    next(err);
  }
};
