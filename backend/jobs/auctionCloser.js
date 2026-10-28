const cron = require('node-cron');
const Listing = require('../models/Listing');
const Handover = require('../models/Handover');
const { createExchangeForClosedAuction } = require('../services/exchangeService');

/**
 * Runs every 10 seconds.
 * Closes all active listings whose endsAt has passed.
 * Creates a Handover record for listings with a winner.
 * Marks listings with no bids (or unmet reserve) as 'unsold'.
 */
const startAuctionCloser = (io) => {
  cron.schedule('*/10 * * * * *', async () => {
    try {
      const now = new Date();
      const expiredListings = await Listing.find({
        status: 'active',
        endsAt: { $lte: now },
      });

      for (const listing of expiredListings) {
        try {
          const hadBids = Boolean(listing.winner || listing.leadingBid);
          const reserveMet =
            !listing.reservePrice || listing.currentPrice >= listing.reservePrice;

          if (hadBids && reserveMet && listing.winner) {
            const updated = await Listing.findOneAndUpdate(
              { _id: listing._id, status: 'active' },
              { status: 'closed' },
              { returnDocument: 'after' }
            );

            if (!updated) continue; // Already processed concurrently

            // Create handover record (legacy) and rich Exchange record
            await createExchangeForClosedAuction(listing, io);

            // Notify clients in room
            if (io) {
              io.to(`auction:${listing._id}`).emit('auction:closed', {
                listingId: listing._id,
                winner: listing.winner,
                finalPrice: listing.currentPrice,
              });
            }
            console.log(`🔨 Auction closed: ${listing.title} → winner ${listing.winner}`);
          } else {
            const updated = await Listing.findOneAndUpdate(
              { _id: listing._id, status: 'active' },
              { status: 'unsold' },
              { returnDocument: 'after' }
            );

            if (!updated) continue;

            if (io) {
              io.to(`auction:${listing._id}`).emit('auction:closed', {
                listingId: listing._id,
                winner: null,
                finalPrice: null,
                reason: listing.reservePrice && !reserveMet ? 'Reserve not met' : 'No bids',
              });
            }
            console.log(`📦 Auction unsold: ${listing.title}`);
          }
        } catch (itemErr) {
          console.error(`Error closing listing ${listing._id}:`, itemErr.message);
        }
      }
    } catch (err) {
      console.error('Auction closer error:', err);
    }
  });

  console.log('⏰ Auction auto-close scheduler started (every 10 s)');
};

module.exports = { startAuctionCloser };
