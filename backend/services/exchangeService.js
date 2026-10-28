const Exchange = require('../models/Exchange');
const Handover = require('../models/Handover');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const Listing = require('../models/Listing');
const User = require('../models/User');
const { getIO } = require('./notificationService');

/**
 * Creates an exchange record when an auction closes with a winner.
 * Fully idempotent against retries or concurrent scheduler ticks.
 */
async function createExchangeForClosedAuction(listingDocOrId, io = null) {
  try {
    const socketIo = io || getIO();
    const listingId = listingDocOrId?._id || listingDocOrId;
    const listing = await Listing.findById(listingId).populate('seller', 'username').populate('winner', 'username');

    if (!listing) return null;
    if (!listing.winner) return null; // No exchange without a winner

    // Maintain backwards-compatible Handover record for legacy tests
    let existingHandover = await Handover.findOne({ listing: listing._id });
    if (!existingHandover) {
      existingHandover = await Handover.create({
        listing: listing._id,
        seller: listing.seller?._id || listing.seller,
        buyer: listing.winner?._id || listing.winner,
        finalPrice: listing.currentPrice,
      }).catch(() => null);
    }

    // 1. Check if Exchange already exists
    let exchange = await Exchange.findOne({ listing: listing._id });
    if (exchange) {
      return exchange;
    }

    const sellerId = listing.seller?._id || listing.seller;
    const buyerId = listing.winner?._id || listing.winner;

    // 2. Link or create private buyer-seller conversation for exchange communication
    let conv = await Conversation.findOne({
      listing: listing._id,
      buyer: buyerId,
      seller: sellerId,
    });

    if (!conv) {
      conv = await Conversation.create({
        listing: listing._id,
        buyer: buyerId,
        seller: sellerId,
        participants: [buyerId, sellerId],
        type: 'auction',
        lastMessagePreview: 'Exchange created. Coordinate handover here.',
      });
    }

    // 3. Create Exchange
    try {
      exchange = await Exchange.create({
        listing: listing._id,
        seller: sellerId,
        buyer: buyerId,
        winningBid: listing.leadingBid,
        winningAmount: listing.currentPrice,
        conversation: conv._id,
        status: 'READY_TO_ARRANGE',
        history: [
          {
            actor: null,
            action: 'EXCHANGE_CREATED',
            timestamp: new Date(),
            note: `Auction won at ₹${listing.currentPrice}. Coordinate physical handover.`,
          },
        ],
      });
    } catch (err) {
      if (err.code === 11000) {
        return await Exchange.findOne({ listing: listing._id });
      }
      throw err;
    }

    // 4. Create persistent in-app notifications
    const thumbnailUrl = listing.images?.[0]?.url || '';

    // Notify Buyer
    await Notification.create({
      recipient: buyerId,
      sender: sellerId,
      type: 'system',
      title: `You won the auction: ${listing.title}!`,
      message: `Congratulations! Coordinate physical handover with the seller for ₹${listing.currentPrice}.`,
      link: `/exchange?id=${exchange._id}`,
      imageUrl: thumbnailUrl,
      startingPrice: listing.startingPrice,
      listing: listing._id,
      deduplicationKey: `exchange_buyer:${exchange._id}`,
      isRead: false,
    }).catch(() => {});

    // Notify Seller
    await Notification.create({
      recipient: sellerId,
      sender: buyerId,
      type: 'system',
      title: `Auction won: ${listing.title}`,
      message: `Your listing sold for ₹${listing.currentPrice}. Coordinate physical handover with the winner.`,
      link: `/exchange?id=${exchange._id}`,
      imageUrl: thumbnailUrl,
      startingPrice: listing.startingPrice,
      listing: listing._id,
      deduplicationKey: `exchange_seller:${exchange._id}`,
      isRead: false,
    }).catch(() => {});

    // 5. Emit real-time Socket.IO notifications to both users
    if (socketIo) {
      socketIo.to(`user:${buyerId}`).emit('exchange:created', {
        exchangeId: exchange._id,
        listingId: listing._id,
        role: 'buyer',
      });
      socketIo.to(`user:${sellerId}`).emit('exchange:created', {
        exchangeId: exchange._id,
        listingId: listing._id,
        role: 'seller',
      });
    }

    console.log(`🤝 [ExchangeService] Created exchange for "${listing.title}" (Buyer: ${buyerId}, Seller: ${sellerId})`);
    return exchange;
  } catch (err) {
    console.error('[ExchangeService] createExchange error:', err);
    return null;
  }
}

module.exports = {
  createExchangeForClosedAuction,
};
