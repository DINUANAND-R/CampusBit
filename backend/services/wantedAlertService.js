const WantedAlert = require('../models/WantedAlert');
const WantedAlertMatch = require('../models/WantedAlertMatch');
const Notification = require('../models/Notification');
const Listing = require('../models/Listing');

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'with', 'in', 'on', 'at', 'to', 'from', 'by', 'is', 'it', 'my', 'your'
]);

/**
 * Normalizes text and evaluates whether an alert's keywords match a listing's title and description.
 * Prevents generic false positives by requiring meaningful tokens to match.
 */
function evaluateKeywordMatch(alertKeywords, listingTitle, listingDescription) {
  if (!alertKeywords || !alertKeywords.trim()) {
    return { matches: true, reason: 'Matched general alert criteria' };
  }

  const clean = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normKeywords = clean(alertKeywords);
  const normTitle = clean(listingTitle);
  const normDesc = clean(listingDescription);

  // 1. Direct exact phrase match in title or description
  if (normTitle.includes(normKeywords)) {
    return { matches: true, reason: `Exact match for "${alertKeywords}" in title` };
  }
  if (normDesc.includes(normKeywords)) {
    return { matches: true, reason: `Exact match for "${alertKeywords}" in description` };
  }

  // 2. Tokenized match for multi-word queries
  const alertTokens = normKeywords
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  if (alertTokens.length === 0) {
    const matched = normTitle.includes(normKeywords) || normDesc.includes(normKeywords);
    return { matches: matched, reason: matched ? `Keyword "${alertKeywords}" matched` : null };
  }

  const titleTokens = new Set(normTitle.split(' '));
  const descTokens = new Set(normDesc.split(' '));

  // All meaningful terms must appear across title and description
  const allTokensPresent = alertTokens.every(
    (token) => titleTokens.has(token) || descTokens.has(token)
  );

  if (allTokensPresent) {
    const inTitle = alertTokens.some((t) => titleTokens.has(t));
    return {
      matches: true,
      reason: `Keywords [${alertTokens.join(', ')}] matched in ${inTitle ? 'product title' : 'description'}`,
    };
  }

  return { matches: false, reason: null };
}

/**
 * Evaluates a listing against all active wanted alerts and generates durable notifications for matches.
 * Fully idempotent and safe against repeated executions or concurrent scheduler ticks.
 */
async function matchListingAgainstWantedAlerts(listingDocOrId, io = null) {
  try {
    const listingId = listingDocOrId?._id || listingDocOrId;
    const listing = await Listing.findById(listingId).populate('seller', 'username');

    if (!listing) return { success: false, reason: 'Listing not found' };
    if (listing.status !== 'active') return { success: false, reason: 'Listing is not active' };
    if (listing.isModerated) return { success: false, reason: 'Listing is moderated' };

    const now = new Date();
    if (listing.publishAt && new Date(listing.publishAt) > now) {
      return { success: false, reason: 'Listing is not yet published' };
    }
    if (listing.endsAt && new Date(listing.endsAt) <= now) {
      return { success: false, reason: 'Listing has already ended' };
    }

    const sellerId = listing.seller?._id || listing.seller;

    // Build indexed query filter for candidate alerts
    const candidateQuery = {
      user: { $ne: sellerId }, // Exclude seller's own alerts
      status: 'ACTIVE',
      expiresAt: { $gt: now },
      maxBudget: { $gte: listing.startingPrice }, // Starting price must be <= alert's max budget
    };

    // Category filtering
    if (listing.category) {
      candidateQuery.$or = [
        { category: 'all' },
        { category: null },
        { category: '' },
        { category: listing.category },
      ];
    }

    // Condition filtering
    if (listing.condition) {
      candidateQuery.$and = [
        {
          $or: [
            { condition: 'any' },
            { condition: null },
            { condition: '' },
            { condition: listing.condition },
          ],
        },
      ];
    }

    const BATCH_SIZE = 100;
    let lastId = null;
    let hasMore = true;
    let matchedCount = 0;

    while (hasMore) {
      const pageQuery = { ...candidateQuery };
      if (lastId) {
        pageQuery._id = { $gt: lastId };
      }

      const alerts = await WantedAlert.find(pageQuery)
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .lean();

      if (!alerts || alerts.length === 0) {
        hasMore = false;
        break;
      }

      for (const alert of alerts) {
        // Evaluate keyword match against title and description
        const evalResult = evaluateKeywordMatch(alert.keywords, listing.title, listing.description);

        if (!evalResult.matches) {
          continue;
        }

        const reason = `${evalResult.reason}. Listed at ₹${listing.startingPrice} (under budget of ₹${alert.maxBudget}).`;

        // Idempotently create WantedAlertMatch record
        let matchRecord = null;
        try {
          matchRecord = await WantedAlertMatch.create({
            alert: alert._id,
            listing: listing._id,
            user: alert.user,
            matchReason: reason,
            startingPrice: listing.startingPrice,
          });
        } catch (err) {
          if (err.code === 11000) {
            // Already matched and notified previously
            continue;
          }
          console.error(`[WantedAlertService] Error creating match record:`, err);
          continue;
        }

        // Create persistent in-app notification
        try {
          const notif = await Notification.create({
            recipient: alert.user,
            sender: sellerId,
            type: 'WANTED_ALERT_MATCH',
            title: `Wanted Alert Match: ${listing.title}`,
            message: `A "${listing.title}" matching your alert is listed for ₹${listing.startingPrice}, within your ₹${alert.maxBudget} budget limit.`,
            link: `/listings/${listing._id}`,
            imageUrl: listing.images?.[0]?.url || '',
            startingPrice: listing.startingPrice,
            listing: listing._id,
            wantedAlert: alert._id,
            deduplicationKey: `wanted_match:${alert._id}:${listing._id}`,
            isRead: false,
          });

          matchRecord.notification = notif._id;
          await matchRecord.save();

          // Increment match count on the alert
          await WantedAlert.updateOne(
            { _id: alert._id },
            { $inc: { matchCount: 1 }, $set: { lastMatchedAt: new Date() } }
          );

          matchedCount++;

          // Real-time Socket.IO emission to recipient's personal room
          if (io) {
            io.to(`user:${alert.user}`).emit('notification:new', {
              type: 'WANTED_ALERT_MATCH',
              title: `Wanted Alert Match: ${listing.title}`,
              message: `A "${listing.title}" matching your alert is listed for ₹${listing.startingPrice}, within your ₹${alert.maxBudget} budget limit.`,
              link: `/listings/${listing._id}`,
              listingId: listing._id,
              imageUrl: listing.images?.[0]?.url || '',
              startingPrice: listing.startingPrice,
              createdAt: notif.createdAt,
            });
          }
        } catch (notifErr) {
          // If notification failed (e.g. duplicate key), keep match intact
          console.error(`[WantedAlertService] Notification error:`, notifErr);
        }
      }

      lastId = alerts[alerts.length - 1]._id;
      if (alerts.length < BATCH_SIZE) {
        hasMore = false;
        break;
      }
    }

    if (matchedCount > 0) {
      console.log(`🎯 [WantedAlertService] Matched "${listing.title}" with ${matchedCount} student wanted alerts.`);
    }

    return { success: true, matchedCount };
  } catch (err) {
    console.error(`[WantedAlertService] Matching error for listing ${listingDocOrId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Housekeeping: marks expired active alerts as EXPIRED.
 */
async function expireOverdueAlerts() {
  try {
    const result = await WantedAlert.updateMany(
      { status: 'ACTIVE', expiresAt: { $lte: new Date() } },
      { status: 'EXPIRED' }
    );
    if (result.modifiedCount > 0) {
      console.log(`⏳ [WantedAlertService] Marked ${result.modifiedCount} overdue alerts as EXPIRED.`);
    }
  } catch (err) {
    console.error('[WantedAlertService] Expire overdue alerts error:', err);
  }
}

module.exports = {
  evaluateKeywordMatch,
  matchListingAgainstWantedAlerts,
  expireOverdueAlerts,
};
