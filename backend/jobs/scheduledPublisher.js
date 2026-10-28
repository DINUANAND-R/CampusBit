const cron = require('node-cron');
const Listing = require('../models/Listing');

/**
 * Checks for scheduled listings whose publication time has arrived.
 * Performs atomic updates to guarantee each listing is published exactly once,
 * even with concurrent scheduler triggers or clustered environments.
 */
const publishDueListings = async (io) => {
  try {
    const now = new Date();

    // 1. Check for expired scheduled listings where endsAt has already passed
    // These must never become active; mark them cancelled with a clear reason.
    const expiredScheduled = await Listing.find({
      status: 'scheduled',
      endsAt: { $lte: now },
    });

    for (const item of expiredScheduled) {
      const cancelled = await Listing.findOneAndUpdate(
        { _id: item._id, status: 'scheduled' },
        {
          status: 'cancelled',
          cancelledAt: now,
          cancellationReason: 'Auction end time passed before publication schedule',
        },
        { returnDocument: 'after' }
      );
      if (cancelled) {
        console.log(`⚠️ Cancelled expired scheduled listing: "${cancelled.title}" (ID: ${cancelled._id})`);
        if (io) {
          io.to(`auction:${cancelled._id}`).emit('auction:cancelled', {
            listingId: cancelled._id,
            reason: cancelled.cancellationReason,
            cancelledAt: cancelled.cancelledAt,
          });
        }
      }
    }

    // 2. Find and publish listings whose publishAt has arrived and endsAt is in the future
    const dueListings = await Listing.find({
      status: 'scheduled',
      publishAt: { $lte: now },
      endsAt: { $gt: now },
    });

    for (const item of dueListings) {
      const published = await Listing.findOneAndUpdate(
        { _id: item._id, status: 'scheduled' },
        {
          status: 'active',
          publishedAt: now,
          startAt: now,
        },
        { returnDocument: 'after' }
      );

      if (published) {
        console.log(`📢 Published scheduled listing: "${published.title}" (ID: ${published._id})`);
        if (io) {
          // Broadcast to auction room and lobby
          io.to(`auction:${published._id}`).emit('auction:status_change', {
            listingId: published._id,
            status: 'active',
            endsAt: published.endsAt,
          });
          io.emit('auction:published', {
            listingId: published._id,
            title: published.title,
            currentPrice: published.currentPrice,
            endsAt: published.endsAt,
          });
        }
      }
    }
  } catch (err) {
    console.error('Scheduled publisher error:', err);
  }
};

/**
 * Initializes the scheduled listing publication service.
 * - Runs immediately on startup to recover any overdue listings across server restarts.
 * - Runs periodically every 5 seconds.
 */
const startScheduledPublisher = (io) => {
  // Immediate recovery on boot
  publishDueListings(io);

  // Periodic check every 5 seconds
  cron.schedule('*/5 * * * * *', () => {
    publishDueListings(io);
  });

  console.log('⏰ Scheduled listing publisher started (every 5 s)');
};

module.exports = { startScheduledPublisher, publishDueListings };
