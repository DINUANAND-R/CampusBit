const Exchange = require('../models/Exchange');
const Handover = require('../models/Handover');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { getIO } = require('../services/notificationService');

// GET /api/exchanges
exports.getExchanges = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { role = 'all', status } = req.query;

    const filter = {};
    if (role === 'buyer') {
      filter.buyer = userId;
    } else if (role === 'seller') {
      filter.seller = userId;
    } else {
      filter.$or = [{ buyer: userId }, { seller: userId }];
    }

    if (status && status !== 'all') {
      filter.status = status.toUpperCase();
    }

    const exchanges = await Exchange.find(filter)
      .populate('listing', 'title images startingPrice currentPrice status category endsAt')
      .populate('seller', 'username avatarUrl')
      .populate('buyer', 'username avatarUrl')
      .populate('conversation', '_id lastMessagePreview updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    res.json({ exchanges });
  } catch (err) {
    next(err);
  }
};

// GET /api/exchanges/:id
exports.getExchange = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const exchange = await Exchange.findById(req.params.id)
      .populate('listing', 'title images startingPrice currentPrice status category endsAt')
      .populate('seller', 'username avatarUrl email campusId')
      .populate('buyer', 'username avatarUrl email campusId')
      .populate('conversation')
      .populate('history.actor', 'username avatarUrl');

    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    const isParticipant =
      exchange.seller._id.toString() === userId ||
      exchange.buyer._id.toString() === userId ||
      req.user.role === 'admin';

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied: not an exchange participant' });
    }

    res.json({ exchange });
  } catch (err) {
    next(err);
  }
};

// POST /api/exchanges/:id/handover-proposals
exports.proposeHandover = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { proposedDate, proposedTime } = req.body;
    const location = req.body.meetingLocation || req.body.location;
    const noteText = req.body.notes || req.body.note || '';

    if (!proposedDate || !proposedTime || !location || !location.trim()) {
      return res.status(400).json({ message: 'Date, time, and campus meeting location are required' });
    }

    const exchange = await Exchange.findById(req.params.id).populate('listing', 'title images');
    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    const isBuyer = exchange.buyer.toString() === userId;
    const isSeller = exchange.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: 'Only exchange participants can propose handover' });
    }

    if (['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(exchange.status)) {
      return res.status(400).json({ message: `Cannot propose handover when exchange is ${exchange.status}` });
    }

    const proposalDate = new Date(proposedDate);
    if (isNaN(proposalDate.getTime())) {
      return res.status(400).json({ message: 'Invalid proposed date' });
    }

    const proposedRole = isBuyer ? 'buyer' : 'seller';

    // Set proposal
    exchange.handoverProposal = {
      proposedDate: proposalDate,
      proposedTime: proposedTime.trim(),
      meetingLocation: location.trim(),
      notes: noteText.trim(),
      proposedBy: req.user._id,
      proposedRole: proposedRole,
      status: 'PROPOSED',
    };

    // If currently ready to arrange, keep it or keep waiting for response
    exchange.history.push({
      actor: req.user._id,
      action: 'HANDOVER_PROPOSED',
      timestamp: new Date(),
      note: `Proposed meeting at ${location.trim()} on ${proposalDate.toLocaleDateString()} (${proposedTime.trim()})`,
    });

    await exchange.save();

    // Counterparty
    const counterpartyId = isBuyer ? exchange.seller : exchange.buyer;
    const roleName = isBuyer ? 'Buyer' : 'Seller';

    await Notification.create({
      recipient: counterpartyId,
      sender: req.user._id,
      type: 'system',
      title: 'Handover proposal received',
      message: `${req.user.username} (${roleName}) proposed to meet at ${location.trim()} on ${proposalDate.toLocaleDateString()}.`,
      link: `/exchange?id=${exchange._id}`,
      imageUrl: exchange.listing?.images?.[0]?.url || '',
      listing: exchange.listing?._id,
      isRead: false,
    }).catch(() => {});

    // Real-time broadcast
    const io = req.app.get('io') || getIO();
    if (io) {
      io.to(`user:${counterpartyId}`).emit('exchange:update', {
        exchangeId: exchange._id,
        action: 'HANDOVER_PROPOSED',
        proposal: exchange.handoverProposal,
      });
      io.to(`user:${userId}`).emit('exchange:update', {
        exchangeId: exchange._id,
        action: 'HANDOVER_PROPOSED',
        proposal: exchange.handoverProposal,
      });
    }

    const exchangeObj = exchange.toObject();
    if (exchangeObj.handoverProposal) {
      exchangeObj.handoverProposal.proposedBy = proposedRole;
      exchangeObj.handoverProposal.proposedById = req.user._id;
    }

    res.status(200).json({ message: 'Proposal submitted', exchange: exchangeObj });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/exchanges/:id/handover-proposals/:proposalId/respond
exports.respondHandoverProposal = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { accept, rejectionReason = '', action } = req.body;
    const isAccept = accept === true || accept === 'true' || action === 'accept';

    const exchange = await Exchange.findById(req.params.id).populate('listing', 'title images');
    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    if (!exchange.handoverProposal) {
      return res.status(400).json({ message: 'No active handover proposal to respond to' });
    }

    // Must be the other party (cannot respond to own proposal)
    const isProposer = exchange.handoverProposal.proposedBy.toString() === userId;
    const isParticipant =
      exchange.buyer.toString() === userId || exchange.seller.toString() === userId;

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied: not an exchange participant' });
    }

    if (isProposer) {
      return res.status(400).json({ message: 'You cannot respond to your own proposal' });
    }

    const counterpartyId = exchange.handoverProposal.proposedBy;

    if (isAccept) {
      exchange.handoverProposal.status = 'ACCEPTED';
      exchange.handoverProposal.respondedAt = new Date();
      exchange.handoverProposal.respondedBy = req.user._id;
      exchange.status = 'HANDOVER_SCHEDULED';

      exchange.history.push({
        actor: req.user._id,
        action: 'HANDOVER_ACCEPTED',
        timestamp: new Date(),
        note: `Handover arrangement accepted. Meeting at ${exchange.handoverProposal.meetingLocation}`,
      });

      await exchange.save();

      // Notify proposer
      await Notification.create({
        recipient: counterpartyId,
        sender: req.user._id,
        type: 'system',
        title: 'Handover proposal accepted!',
        message: `${req.user.username} accepted your handover proposal at ${exchange.handoverProposal.meetingLocation}.`,
        link: `/exchange?id=${exchange._id}`,
        imageUrl: exchange.listing?.images?.[0]?.url || '',
        listing: exchange.listing?._id,
        isRead: false,
      }).catch(() => {});
    } else {
      exchange.handoverProposal.status = 'DECLINED';
      exchange.handoverProposal.respondedAt = new Date();
      exchange.handoverProposal.respondedBy = req.user._id;
      exchange.handoverProposal.rejectionReason = rejectionReason.trim();

      exchange.history.push({
        actor: req.user._id,
        action: 'HANDOVER_REJECTED',
        timestamp: new Date(),
        note: `Proposal declined: ${rejectionReason.trim() || 'Please propose another time/location'}`,
      });

      await exchange.save();

      // Notify proposer
      await Notification.create({
        recipient: counterpartyId,
        sender: req.user._id,
        type: 'system',
        title: 'Handover proposal declined',
        message: `${req.user.username} declined the handover proposal. Please propose another time or location.`,
        link: `/exchange?id=${exchange._id}`,
        imageUrl: exchange.listing?.images?.[0]?.url || '',
        listing: exchange.listing?._id,
        isRead: false,
      }).catch(() => {});
    }

    // Real-time broadcast
    const io = req.app.get('io') || getIO();
    if (io) {
      io.to(`user:${counterpartyId}`).emit('exchange:update', {
        exchangeId: exchange._id,
        action: exchange.handoverProposal.status,
        exchange,
      });
      io.to(`user:${userId}`).emit('exchange:update', {
        exchangeId: exchange._id,
        action: exchange.handoverProposal.status,
        exchange,
      });
    }

    const exchangeObj = exchange.toObject();
    if (exchangeObj.handoverProposal) {
      exchangeObj.handoverProposal.proposedBy = exchange.handoverProposal.proposedRole || (exchange.buyer.toString() === exchange.handoverProposal.proposedBy.toString() ? 'buyer' : 'seller');
    }

    res.json({ message: `Proposal ${exchange.handoverProposal.status.toLowerCase()}`, exchange: exchangeObj });
  } catch (err) {
    next(err);
  }
};

// POST /api/exchanges/:id/confirm-handover
// Two-party confirmation: buyer confirms receipt, seller confirms handover
exports.confirmHandover = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const exchange = await Exchange.findById(req.params.id).populate('listing');

    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    const isBuyer = exchange.buyer.toString() === userId;
    const isSeller = exchange.seller.toString() === userId;

    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: 'Only buyer or seller can confirm handover' });
    }

    const { role } = req.body;
    if (role === 'seller' && !isSeller) {
      return res.status(403).json({ message: 'Buyer cannot confirm seller handover' });
    }
    if (role === 'buyer' && !isBuyer) {
      return res.status(403).json({ message: 'Seller cannot confirm buyer receipt' });
    }

    if (exchange.status === 'COMPLETED') {
      return res.status(400).json({ message: 'Exchange has already been completed' });
    }
    if (exchange.status === 'DISPUTED') {
      return res.status(400).json({ message: 'Cannot confirm handover while a dispute is open' });
    }

    const now = new Date();
    let actionNote = '';

    if (isSeller) {
      if (exchange.sellerHandedOverAt) {
        return res.status(400).json({ message: 'You have already confirmed handing over the product' });
      }
      exchange.sellerHandedOverAt = now;
      actionNote = 'Seller confirmed item handed over to buyer';
      exchange.history.push({
        actor: req.user._id,
        action: 'SELLER_CONFIRMED_HANDOVER',
        timestamp: now,
        note: actionNote,
      });
    } else if (isBuyer) {
      if (exchange.buyerReceivedAt) {
        return res.status(400).json({ message: 'You have already confirmed receiving the product' });
      }
      exchange.buyerReceivedAt = now;
      actionNote = 'Buyer confirmed item received in good order';
      exchange.history.push({
        actor: req.user._id,
        action: 'BUYER_CONFIRMED_RECEIPT',
        timestamp: now,
        note: actionNote,
      });
    }

    // Check if BOTH have confirmed
    const bothConfirmed = Boolean(exchange.sellerHandedOverAt && exchange.buyerReceivedAt);

    if (bothConfirmed) {
      exchange.status = 'COMPLETED';
      exchange.completedAt = now;
      exchange.history.push({
        actor: null,
        action: 'EXCHANGE_COMPLETED',
        timestamp: now,
        note: 'Both buyer and seller confirmed. Exchange successfully completed!',
      });

      // Mark listing as completed
      if (exchange.listing) {
        const listingId = exchange.listing._id || exchange.listing;
        await Listing.updateOne({ _id: listingId }, { status: 'completed' });
        await Handover.updateOne(
          { listing: listingId },
          { sellerDecision: 'approved', completedAt: now }
        ).catch(() => {});
      }
    } else {
      exchange.status = 'HANDED_OVER';
    }

    await exchange.save();

    // Notify the other party
    const counterpartyId = isBuyer ? exchange.seller : exchange.buyer;
    const msg = bothConfirmed
      ? `Exchange completed! Both parties have confirmed handover for ${exchange.listing?.title || 'product'}.`
      : `${req.user.username} confirmed their part of the handover. Please confirm yours to complete the transaction.`;

    await Notification.create({
      recipient: counterpartyId,
      sender: req.user._id,
      type: 'system',
      title: bothConfirmed ? 'Transaction Completed!' : 'Handover Confirmation Pending',
      message: msg,
      link: `/exchange?id=${exchange._id}`,
      imageUrl: exchange.listing?.images?.[0]?.url || '',
      listing: exchange.listing?._id,
      isRead: false,
    }).catch(() => {});

    // Real-time broadcast
    const io = req.app.get('io') || getIO();
    if (io) {
      io.to(`user:${exchange.buyer}`).emit('exchange:update', {
        exchangeId: exchange._id,
        status: exchange.status,
        exchange,
      });
      io.to(`user:${exchange.seller}`).emit('exchange:update', {
        exchangeId: exchange._id,
        status: exchange.status,
        exchange,
      });
    }

    res.json({
      message: bothConfirmed ? 'Exchange completed successfully!' : 'Confirmation recorded',
      exchange,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/exchanges/:id/disputes
exports.raiseDispute = async (req, res, next) => {
  try {
    const userId = req.user._id.toString();
    const { reason, details = '' } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Dispute reason is required' });
    }

    const exchange = await Exchange.findById(req.params.id).populate('listing', 'title images');
    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    const isBuyer = exchange.buyer.toString() === userId;
    const isSeller = exchange.seller.toString() === userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ message: 'Only exchange participants can raise a dispute' });
    }

    if (exchange.status === 'COMPLETED') {
      return res.status(400).json({ message: 'Cannot dispute an already completed exchange' });
    }

    exchange.status = 'DISPUTED';
    exchange.dispute = {
      raisedBy: req.user._id,
      reason: reason.trim(),
      details: details.trim(),
      raisedAt: new Date(),
      status: 'OPEN',
    };

    exchange.history.push({
      actor: req.user._id,
      action: 'DISPUTE_RAISED',
      timestamp: new Date(),
      note: `Dispute raised: ${reason.trim()} - ${details.trim()}`,
    });

    await exchange.save();

    // Notify the other party
    const counterpartyId = isBuyer ? exchange.seller : exchange.buyer;
    await Notification.create({
      recipient: counterpartyId,
      sender: req.user._id,
      type: 'system',
      title: 'Dispute raised on transaction',
      message: `${req.user.username} raised a dispute: "${reason.trim()}". An admin will review the matter.`,
      link: `/exchange?id=${exchange._id}`,
      imageUrl: exchange.listing?.images?.[0]?.url || '',
      listing: exchange.listing?._id,
      isRead: false,
    }).catch(() => {});

    // Real-time broadcast
    const io = req.app.get('io') || getIO();
    if (io) {
      io.to(`user:${exchange.buyer}`).emit('exchange:update', { exchangeId: exchange._id, exchange });
      io.to(`user:${exchange.seller}`).emit('exchange:update', { exchangeId: exchange._id, exchange });
    }

    res.status(201).json({ message: 'Dispute raised. Admin team has been alerted.', exchange });
  } catch (err) {
    next(err);
  }
};

// GET /api/exchanges/:id/history
exports.getHistory = async (req, res, next) => {
  try {
    const exchange = await Exchange.findById(req.params.id)
      .populate('history.actor', 'username avatarUrl')
      .lean();

    if (!exchange) {
      return res.status(404).json({ message: 'Exchange record not found' });
    }

    const userId = req.user._id.toString();
    const isParticipant =
      exchange.seller.toString() === userId ||
      exchange.buyer.toString() === userId ||
      req.user.role === 'admin';

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ history: exchange.history || [] });
  } catch (err) {
    next(err);
  }
};
