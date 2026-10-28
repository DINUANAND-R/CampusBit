const Bid = require('../models/Bid');
const Listing = require('../models/Listing');

const LATE_BID_WINDOW_MS = 30 * 1000; // 30 seconds

/**
 * Core bid placement — also used by Socket.IO handler.
 * Returns { bid, listing, extended } or throws an Error with .status.
 */
const placeBid = async (listingId, bidderId, amount) => {
  // Load listing fresh each time — use a retry loop for optimistic concurrency
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    const listing = await Listing.findById(listingId);
    if (!listing) {
      const err = new Error('Listing not found'); err.status = 404; throw err;
    }
    if (listing.status !== 'active') {
      const err = new Error('Auction is not active'); err.status = 400; throw err;
    }
    if (new Date() > listing.endsAt) {
      const err = new Error('Auction has ended'); err.status = 400; throw err;
    }
    if (listing.seller.toString() === bidderId.toString()) {
      const err = new Error('Seller cannot bid on their own listing'); err.status = 403; throw err;
    }

    const minRequired = listing.currentPrice + listing.minBidIncrement;
    if (amount < minRequired) {
      const err = new Error(
        `Bid must be at least ₹${minRequired} (current ₹${listing.currentPrice} + increment ₹${listing.minBidIncrement})`
      );
      err.status = 400;
      throw err;
    }

    // Check for late bid
    const now = new Date();
    const timeLeft = listing.endsAt - now;
    const isLateBid = timeLeft <= LATE_BID_WINDOW_MS && timeLeft > 0;
    let extended = false;
    let newEndsAt = listing.endsAt;

    if (isLateBid && listing.extensionCount < listing.maxExtensions) {
      newEndsAt = new Date(listing.endsAt.getTime() + LATE_BID_WINDOW_MS);
      extended = true;
    }

    // Atomic update with version check (optimistic concurrency)
    const bid = await Bid.create({
      listing: listing._id,
      bidder: bidderId,
      amount,
      isLateBid,
      triggeredExtension: extended,
    });

    const updateQuery = { _id: listing._id, __v: listing.__v };
    const updateData = {
      currentPrice: amount,
      leadingBid: bid._id,
      winner: bidderId,
      $inc: { __v: 1 },
    };
    if (extended) {
      updateData.endsAt = newEndsAt;
      updateData.$inc = { __v: 1, extensionCount: 1 };
    }

    const updated = await Listing.findOneAndUpdate(updateQuery, updateData, { new: true });

    if (!updated) {
      // Another bid snuck in — retry
      await Bid.findByIdAndDelete(bid._id);
      continue;
    }

    return { bid, listing: updated, extended, newEndsAt };
  }

  const err = new Error('Bid conflict — please try again');
  err.status = 409;
  throw err;
};

// POST /api/bids
exports.placeBidHttp = async (req, res, next) => {
  try {
    const { listingId, amount } = req.body;
    if (!listingId || amount === undefined) {
      return res.status(400).json({ message: 'listingId and amount are required' });
    }
    const result = await placeBid(listingId, req.user._id, Number(amount));

    // Broadcast real-time update to all clients in auction room
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${listingId}`).emit('auction:bid_update', {
        listingId,
        amount: result.bid.amount,
        bidderId: req.user._id,
        bidderName: req.user.username,
        endsAt: result.listing.endsAt,
        isLateBid: result.bid.isLateBid,
      });

      if (result.extended) {
        io.to(`auction:${listingId}`).emit('auction:extended', {
          listingId,
          newEndsAt: result.newEndsAt,
          extensionCount: result.listing.extensionCount,
        });
      }
    }

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// GET /api/bids/listing/:id
exports.getBidHistory = async (req, res, next) => {
  try {
    const bids = await Bid.find({ listing: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('bidder', 'username avatarUrl')
      .lean();
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};

// GET /api/bids/my
exports.myBids = async (req, res, next) => {
  try {
    const bids = await Bid.find({ bidder: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'listing', populate: { path: 'seller', select: 'username' } })
      .lean();
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};

module.exports.placeBidCore = placeBid;
