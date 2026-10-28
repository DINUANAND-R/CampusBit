const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const ProxyBid = require('../models/ProxyBid');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('./notificationService');

const LATE_BID_WINDOW_MS = 30 * 1000; // 30 seconds

/**
 * Deterministically evaluates proxy bids for a listing and updates currentPrice,
 * leadingBid, and winner if necessary.
 *
 * PROXY PRICING ALGORITHM:
 * 1. Collect all active proxy bids for the listing, ordered by:
 *    - maxAmount DESC
 *    - createdAt ASC (Deterministic tie-break: earliest submitted timestamp wins)
 * 2. Find highest competing non-leader bid C_competing:
 *    - max(second-highest proxy max, highest manual bid from another user)
 * 3. Calculate target price required for leader to maintain lead:
 *    - If no competing bid: targetPrice = startingPrice + minBidIncrement
 *    - If competing proxy has EQUAL maxAmount:
 *      Leader wins tie-break by timestamp; targetPrice = leader.maxAmount
 *    - If competing bid exists and maxAmount > competing:
 *      targetPrice = min(leader.maxAmount, C_competing + minBidIncrement)
 * 4. Bound targetPrice so it never exceeds leader's maxAmount and never drops below currentPrice.
 * 5. If price or leader changes, create a Bid entry and update the Listing.
 */
async function evaluateProxyBids(listingId, io = null) {
  const socketIo = io || getIO();
  const listing = await Listing.findById(listingId);
  if (!listing) return null;
  if (listing.status !== 'active') return listing;

  const now = new Date();
  if (listing.endsAt && now > listing.endsAt) return listing;

  // Retrieve active proxy bids sorted by maxAmount DESC, then earliest createdAt ASC
  const proxyBids = await ProxyBid.find({
    listing: listingId,
    status: { $ne: 'cancelled' },
  }).sort({ maxAmount: -1, createdAt: 1 });

  if (!proxyBids || proxyBids.length === 0) {
    return listing;
  }

  const leaderProxy = proxyBids[0];
  const secondProxy = proxyBids.length > 1 ? proxyBids[1] : null;

  // Find the highest manual bid placed by any user other than the proxy leader
  const highestCompetingManualBid = await Bid.findOne({
    listing: listingId,
    bidder: { $ne: leaderProxy.bidder },
  }).sort({ amount: -1 });

  const manualCompAmount = highestCompetingManualBid ? highestCompetingManualBid.amount : 0;
  const proxyCompAmount = secondProxy ? secondProxy.maxAmount : 0;
  const competingAmount = Math.max(manualCompAmount, proxyCompAmount);

  const increment = listing.minBidIncrement || 10;
  let targetPrice = listing.currentPrice;

  if (competingAmount === 0) {
    // Only 1 proxy bidder exists and no competing manual bids
    const baseFirstBid = listing.startingPrice + increment;
    targetPrice = Math.min(leaderProxy.maxAmount, Math.max(listing.currentPrice || 0, baseFirstBid));
  } else if (secondProxy && secondProxy.maxAmount === leaderProxy.maxAmount && competingAmount === secondProxy.maxAmount) {
    // Deterministic tie-break for equal maximums:
    // leaderProxy was submitted earlier (createdAt ASC), so leaderProxy wins at their full maximum amount
    targetPrice = leaderProxy.maxAmount;
  } else {
    // Required price to beat competing bid by the configured minimum increment
    // Strictly capped at leaderProxy.maxAmount so leader is never charged beyond their commitment
    targetPrice = Math.min(leaderProxy.maxAmount, competingAmount + increment);
  }

  // Ensure price does not drop below current price
  if (listing.currentPrice && targetPrice < listing.currentPrice) {
    targetPrice = listing.currentPrice;
  }

  // Check if we need to record a new leading bid or update listing
  const currentLeaderId = listing.winner ? listing.winner.toString() : null;
  const newLeaderId = leaderProxy.bidder.toString();
  const priceChanged = listing.currentPrice !== targetPrice;
  const leaderChanged = currentLeaderId !== newLeaderId;

  if (priceChanged || leaderChanged || !listing.leadingBid) {
    // Check for late bid extension
    const timeLeft = listing.endsAt - now;
    const isLateBid = timeLeft <= LATE_BID_WINDOW_MS && timeLeft > 0;
    let extended = false;
    let newEndsAt = listing.endsAt;

    if (isLateBid && listing.extensionCount < listing.maxExtensions) {
      newEndsAt = new Date(listing.endsAt.getTime() + LATE_BID_WINDOW_MS);
      extended = true;
    }

    // Record bid in Bid collection for audit history and public bid list
    const newBid = await Bid.create({
      listing: listing._id,
      bidder: leaderProxy.bidder,
      amount: targetPrice,
      isLateBid,
      triggeredExtension: extended,
    });

    listing.currentPrice = targetPrice;
    listing.leadingBid = newBid._id;
    listing.winner = leaderProxy.bidder;
    if (extended) {
      listing.endsAt = newEndsAt;
      listing.extensionCount += 1;
    }

    await listing.save();

    // Update statuses for all proxy bids on this listing
    await ProxyBid.updateOne(
      { _id: leaderProxy._id },
      { status: 'active' }
    );

    // Any proxy bid with a lower maxAmount (or later timestamp on equal max) is marked outbid
    for (let i = 1; i < proxyBids.length; i++) {
      const otherProxy = proxyBids[i];
      if (otherProxy.status !== 'outbid') {
        otherProxy.status = 'outbid';
        await otherProxy.save();

        // Notify outbid user in real time & DB
        await Notification.create({
          recipient: otherProxy.bidder,
          type: 'PROXY_OUTBID',
          title: "You've been outbid!",
          message: `Your maximum bid on "${listing.title}" was outbid. Current leading bid is ₹${targetPrice.toLocaleString()}.`,
          link: `/listings/${listing._id}`,
          imageUrl: listing.images?.[0]?.url || '',
          listing: listing._id,
          isRead: false,
        }).catch(() => {});

        if (socketIo) {
          socketIo.to(`user:${otherProxy.bidder}`).emit('proxy:outbid', {
            listingId: listing._id,
            currentPrice: targetPrice,
            title: listing.title,
          });
        }
      }
    }

    // Fetch leader username for public broadcast
    const leaderUser = await User.findById(leaderProxy.bidder).select('username');

    // Public real-time broadcast to auction room (without exposing private max)
    if (socketIo) {
      socketIo.to(`auction:${listing._id}`).emit('auction:bid_update', {
        listingId: listing._id,
        amount: targetPrice,
        bidderId: leaderProxy.bidder,
        bidderName: leaderUser?.username || 'Student',
        endsAt: listing.endsAt,
        isLateBid,
      });

      if (extended) {
        socketIo.to(`auction:${listing._id}`).emit('auction:extended', {
          listingId: listing._id,
          newEndsAt,
          extensionCount: listing.extensionCount,
        });
      }

      // Private event to leader
      socketIo.to(`user:${leaderProxy.bidder}`).emit('proxy:leading', {
        listingId: listing._id,
        currentPrice: targetPrice,
        isLeader: true,
      });
    }
  }

  return listing;
}

/**
 * Creates or updates a buyer's proxy (maximum) bid on an active listing.
 * Validates constraints:
 * - Listing must be active and not ended.
 * - Bidder cannot be seller.
 * - maxAmount must be >= min next bid.
 * - If buyer already has an active leading commitment, new max cannot be below current price.
 */
async function setOrUpdateProxyBid(listingId, bidderId, maxAmount, io = null) {
  const socketIo = io || getIO();
  const numMax = Number(maxAmount);

  if (!numMax || isNaN(numMax) || numMax <= 0 || !Number.isInteger(numMax)) {
    const err = new Error('Maximum bid must be a valid positive whole number (₹)');
    err.status = 400;
    throw err;
  }

  const listing = await Listing.findById(listingId);
  if (!listing) {
    const err = new Error('Listing not found');
    err.status = 404;
    throw err;
  }

  if (listing.status !== 'active') {
    const err = new Error(`Cannot place maximum bid: auction is ${listing.status}`);
    err.status = 400;
    throw err;
  }

  const now = new Date();
  if (listing.publishAt && now < listing.publishAt) {
    const err = new Error('Auction is scheduled and has not opened for bidding yet');
    err.status = 400;
    throw err;
  }

  if (listing.endsAt && now > listing.endsAt) {
    const err = new Error('Auction has already ended');
    err.status = 400;
    throw err;
  }

  if (listing.seller.toString() === bidderId.toString()) {
    const err = new Error('Sellers cannot place bids on their own listings');
    err.status = 403;
    throw err;
  }

  const increment = listing.minBidIncrement || 10;
  // Calculate minimum valid next bid
  const hasExistingBids = Boolean(listing.leadingBid || listing.winner);
  const minRequired = hasExistingBids
    ? listing.currentPrice + increment
    : listing.startingPrice + increment;

  // Check if buyer already has an existing proxy bid on this listing
  let proxyBid = await ProxyBid.findOne({ listing: listingId, bidder: bidderId });

  if (proxyBid) {
    // Buyer is updating their existing maximum
    // A new maximum must not be below their already committed bid amount
    const isCurrentLeader = listing.winner && listing.winner.toString() === bidderId.toString();
    if (isCurrentLeader && numMax < listing.currentPrice) {
      const err = new Error(
        `New maximum cannot be lower than your current committed leading price of ₹${listing.currentPrice.toLocaleString()}`
      );
      err.status = 400;
      throw err;
    }

    if (numMax < minRequired && !isCurrentLeader) {
      const err = new Error(
        `Maximum bid must be at least the next minimum bid of ₹${minRequired.toLocaleString()}`
      );
      err.status = 400;
      throw err;
    }

    proxyBid.maxAmount = numMax;
    proxyBid.status = 'active';
    await proxyBid.save();
  } else {
    // New proxy bid
    if (numMax < minRequired) {
      const err = new Error(
        `Maximum bid must be at least ₹${minRequired.toLocaleString()} (current ₹${listing.currentPrice.toLocaleString()} + increment ₹${increment.toLocaleString()})`
      );
      err.status = 400;
      throw err;
    }

    proxyBid = await ProxyBid.create({
      listing: listingId,
      bidder: bidderId,
      maxAmount: numMax,
      status: 'active',
    });
  }

  // Evaluate the proxy bidding engine
  const updatedListing = await evaluateProxyBids(listingId, socketIo);

  // Notify buyer that their proxy bid was accepted and whether they are leading
  const isLeader = updatedListing.winner && updatedListing.winner.toString() === bidderId.toString();

  await Notification.create({
    recipient: bidderId,
    type: 'PROXY_LEADING',
    title: isLeader ? 'You are currently leading!' : 'Maximum bid placed',
    message: isLeader
      ? `Your maximum bid of ₹${numMax.toLocaleString()} on "${listing.title}" is currently leading at ₹${updatedListing.currentPrice.toLocaleString()}.`
      : `Your maximum bid of ₹${numMax.toLocaleString()} on "${listing.title}" was recorded, but another bidder holds a higher maximum.`,
    link: `/listings/${listing._id}`,
    imageUrl: listing.images?.[0]?.url || '',
    listing: listing._id,
    isRead: false,
  }).catch(() => {});

  if (socketIo) {
    socketIo.to(`user:${bidderId}`).emit('proxy:updated', {
      listingId,
      maxAmount: proxyBid.maxAmount,
      isLeader,
      currentPrice: updatedListing.currentPrice,
    });
  }

  return {
    success: true,
    message: isLeader
      ? `Maximum bid of ₹${numMax.toLocaleString()} placed. You are currently leading!`
      : `Maximum bid of ₹${numMax.toLocaleString()} placed.`,
    proxyBid: {
      _id: proxyBid._id,
      listing: proxyBid.listing,
      maxAmount: proxyBid.maxAmount,
      status: proxyBid.status,
      createdAt: proxyBid.createdAt,
      updatedAt: proxyBid.updatedAt,
    },
    currentPrice: updatedListing.currentPrice,
    isLeader,
  };
}

/**
 * Retrieves the authenticated user's private proxy bid for a listing.
 * Strictly scoped to the calling user; never reveals other bidders' maximums.
 */
async function getBuyerProxyBid(listingId, bidderId) {
  const proxyBid = await ProxyBid.findOne({ listing: listingId, bidder: bidderId });
  if (!proxyBid) return null;

  return {
    _id: proxyBid._id,
    listing: proxyBid.listing,
    maxAmount: proxyBid.maxAmount,
    status: proxyBid.status,
    createdAt: proxyBid.createdAt,
    updatedAt: proxyBid.updatedAt,
  };
}

/**
 * Notifies all proxy participants when an auction closes.
 */
async function notifyAuctionCloseParticipants(listing, io = null) {
  try {
    const socketIo = io || getIO();
    const proxyBids = await ProxyBid.find({ listing: listing._id });
    if (!proxyBids || proxyBids.length === 0) return;

    for (const pb of proxyBids) {
      const isWinner = listing.winner && listing.winner.toString() === pb.bidder.toString();
      if (isWinner) {
        await Notification.create({
          recipient: pb.bidder,
          type: 'AUCTION_WON',
          title: '🎉 You won the auction!',
          message: `Congratulations! You won the auction for "${listing.title}" with a final price of ₹${listing.currentPrice.toLocaleString()}.`,
          link: `/exchange?listing=${listing._id}`,
          imageUrl: listing.images?.[0]?.url || '',
          listing: listing._id,
          isRead: false,
        }).catch(() => {});
      } else {
        await Notification.create({
          recipient: pb.bidder,
          type: 'AUCTION_LOST',
          title: 'Auction ended',
          message: `The auction for "${listing.title}" has ended. Final winning bid: ₹${listing.currentPrice ? listing.currentPrice.toLocaleString() : 'N/A'}.`,
          link: `/listings/${listing._id}`,
          imageUrl: listing.images?.[0]?.url || '',
          listing: listing._id,
          isRead: false,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[ProxyBidService] notifyAuctionCloseParticipants error:', err);
  }
}

module.exports = {
  evaluateProxyBids,
  setOrUpdateProxyBid,
  getBuyerProxyBid,
  notifyAuctionCloseParticipants,
};
