const Listing = require('../models/Listing');
const Bid = require('../models/Bid');
const Handover = require('../models/Handover');
const { deleteUploadedFiles, deleteListingFile } = require('../middleware/uploadMiddleware');
const { queueNewListingNotification } = require('../services/notificationService');

// GET /api/listings
// Public browsing and search: ONLY returns active, non-expired auctions
exports.getListings = async (req, res, next) => {
  try {
    const {
      q,
      category,
      sort = 'endsAt',
      page = 1,
      limit = 12,
    } = req.query;

    const now = new Date();
    // Exclude SCHEDULED, CANCELLED, moderated, and closed/expired listings from public feeds
    const filter = {
      status: 'active',
      isModerated: { $ne: true },
      endsAt: { $gt: now },
      $or: [
        { publishAt: null },
        { publishAt: { $lte: now } },
      ],
    };

    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;

    const sortMap = {
      endsAt: { endsAt: 1 },
      newest: { createdAt: -1 },
      price_asc: { currentPrice: 1 },
      price_desc: { currentPrice: -1 },
    };

    const listings = await Listing.find(filter)
      .sort(sortMap[sort] || sortMap.endsAt)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('seller', 'username avatarUrl')
      .lean();

    const total = await Listing.countDocuments(filter);

    res.json({ listings, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/:id
exports.getListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('seller', 'username avatarUrl campusId')
      .populate('winner', 'username')
      .populate('leadingBid');

    if (!listing) return res.status(404).json({ message: 'Listing not found' });

    // Restrict unpublished (scheduled), cancelled, or moderated listings to owner or admin only
    const isOwnerOrAdmin =
      req.user &&
      (listing.seller._id.toString() === req.user._id.toString() || req.user.role === 'admin');

    const now = new Date();
    const isUnpublished =
      listing.status === 'scheduled' ||
      (listing.publishAt && new Date(listing.publishAt) > now);

    if ((isUnpublished || listing.status === 'cancelled' || listing.isModerated) && !isOwnerOrAdmin) {
      return res.status(404).json({ message: 'Listing not found or not currently active' });
    }

    // Track listing view (safeguarded against duplicate immediate spam)
    if (!isOwnerOrAdmin) {
      const viewerId = req.user
        ? String(req.user._id)
        : (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'guest');

      Listing.updateOne(
        { _id: listing._id, viewedIps: { $ne: viewerId } },
        {
          $inc: { viewsCount: 1 },
          $push: { viewedIps: { $each: [viewerId], $slice: -200 } },
        }
      ).exec().catch(() => {});
    }

    res.json({ listing });
  } catch (err) {
    next(err);
  }
};

// POST /api/listings
exports.createListing = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      condition,
      startingPrice,
      reservePrice,
      minBidIncrement,
      durationHours,
      publishType = 'now',
      publishAt,
    } = req.body;

    // 1. Process uploaded files from Multer
    const rawImageFiles = req.files?.images || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'images' || !f.fieldname) : []);
    const rawVideoFiles = req.files?.video || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'video') : []);

    const uploadedImages = rawImageFiles.map((file) => ({
      url: `/uploads/listings/${file.filename}`,
      filename: file.filename,
    }));

    let videoData = null;
    if (rawVideoFiles.length > 0) {
      const vFile = rawVideoFiles[0];
      videoData = {
        url: `/uploads/listings/${vFile.filename}`,
        filename: vFile.filename,
        mimeType: vFile.videoMeta?.mimeType || vFile.mimetype || 'video/mp4',
        size: vFile.size || 0,
        duration: vFile.videoMeta?.duration ?? null,
        posterUrl: '',
      };
    }

    // 2. Process any JSON/string image URLs (e.g. from tests or external input)
    let bodyImages = [];
    if (req.body.images) {
      if (typeof req.body.images === 'string') {
        try {
          bodyImages = JSON.parse(req.body.images);
        } catch {
          bodyImages = [req.body.images];
        }
      } else if (Array.isArray(req.body.images)) {
        bodyImages = req.body.images;
      }
    }
    const normalizedBodyImages = bodyImages.map((img) =>
      typeof img === 'string' ? { url: img, filename: '' } : img
    );

    const allImages = [...uploadedImages, ...normalizedBodyImages];

    // 3. Validate image count
    if (allImages.length < 1) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'At least one image is required (maximum 5)' });
    }
    if (allImages.length > 5) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Maximum 5 images allowed per listing' });
    }

    const now = new Date();
    const duration = Number(durationHours) || 24;

    let status = 'active';
    let targetPublishAt = null;
    let targetPublishedAt = now;
    let startAt = now;
    let endsAt;

    // Check if scheduling for later
    if (publishType === 'later' || publishAt) {
      if (!publishAt) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Scheduled publication date and time is required' });
      }

      const scheduledDate = new Date(publishAt);
      if (isNaN(scheduledDate.getTime())) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Invalid scheduled publication date and time' });
      }

      if (scheduledDate <= now) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Scheduled publication time must be in the future' });
      }

      status = 'scheduled';
      targetPublishAt = scheduledDate;
      targetPublishedAt = null;
      startAt = scheduledDate;

      if (req.body.endsAt) {
        endsAt = new Date(req.body.endsAt);
      } else {
        endsAt = new Date(scheduledDate.getTime() + duration * 60 * 60 * 1000);
      }

      if (endsAt <= scheduledDate) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({
          message: 'Auction closing time must be strictly after the scheduled publication time',
        });
      }
    } else {
      // Publish immediately
      if (req.body.endsAt) {
        endsAt = new Date(req.body.endsAt);
      } else {
        endsAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
      }

      if (endsAt <= now) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Auction end time must be in the future' });
      }
    }

    const listing = await Listing.create({
      seller: req.user._id,
      title,
      description,
      category: category ? category.toLowerCase().trim() : 'other',
      condition: condition ? condition.toLowerCase().trim().replace(/\s+/g, '-') : 'good',
      images: allImages,
      video: videoData,
      startingPrice: Number(startingPrice),
      reservePrice: reservePrice ? Number(reservePrice) : null,
      minBidIncrement: minBidIncrement ? Number(minBidIncrement) : 10,
      status,
      publishAt: targetPublishAt,
      publishedAt: targetPublishedAt,
      startAt,
      endsAt,
    });

    // If published immediately, queue new-listing notification for all eligible users
    if (listing.status === 'active') {
      const io = req.app?.get('io');
      queueNewListingNotification(listing, io).catch((err) => {
        console.error(`[ListingController] Failed to queue notification for listing ${listing._id}:`, err);
      });
    }

    res.status(201).json({ listing });
  } catch (err) {
    // Clean up newly uploaded files on failure
    await deleteUploadedFiles(req.files);
    next(err);
  }
};

// PATCH /api/listings/:id
exports.updateListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      await deleteUploadedFiles(req.files);
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Permission check
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      await deleteUploadedFiles(req.files);
      return res.status(403).json({ message: 'Not authorised' });
    }

    // Status check
    if (listing.status === 'cancelled') {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Cannot edit a cancelled listing' });
    }
    if (listing.status === 'closed' || listing.status === 'completed' || listing.status === 'unsold') {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: `Cannot edit a ${listing.status} listing` });
    }

    // Check if active auction has existing bids
    const bidCount = await Bid.countDocuments({ listing: listing._id });
    const hasBids = bidCount > 0;

    // Rescheduling logic for scheduled listings
    if (req.body.publishAt !== undefined) {
      if (listing.status !== 'scheduled') {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Only scheduled listings can have their publication time modified' });
      }

      const newPublishDate = new Date(req.body.publishAt);
      if (isNaN(newPublishDate.getTime())) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Invalid publication date format' });
      }
      if (newPublishDate <= new Date()) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Rescheduled publication time must be in the future' });
      }

      listing.publishAt = newPublishDate;
      listing.startAt = newPublishDate;

      // Update endsAt if provided or maintain duration
      if (req.body.endsAt) {
        const newEndsAt = new Date(req.body.endsAt);
        if (newEndsAt <= newPublishDate) {
          await deleteUploadedFiles(req.files);
          return res.status(400).json({ message: 'Auction closing time must be after the publication time' });
        }
        listing.endsAt = newEndsAt;
      } else if (req.body.durationHours) {
        const duration = Number(req.body.durationHours);
        listing.endsAt = new Date(newPublishDate.getTime() + duration * 60 * 60 * 1000);
      } else {
        // Automatically maintain the previous auction duration
        const oldStart = listing.startAt ? new Date(listing.startAt).getTime() : newPublishDate.getTime();
        const oldEnd = listing.endsAt ? new Date(listing.endsAt).getTime() : oldStart + 24 * 3600 * 1000;
        const durationMs = Math.max(oldEnd - oldStart, 3600 * 1000); // at least 1 hour
        listing.endsAt = new Date(newPublishDate.getTime() + durationMs);
      }
    }

    // Process retained existing images
    let retainedImages = listing.images;
    if (req.body.existingImages !== undefined) {
      let allowedExisting = [];
      if (typeof req.body.existingImages === 'string') {
        try {
          allowedExisting = JSON.parse(req.body.existingImages);
        } catch {
          allowedExisting = [req.body.existingImages];
        }
      } else if (Array.isArray(req.body.existingImages)) {
        allowedExisting = req.body.existingImages;
      }

      // Map allowed existing items to identifier strings (filename or url)
      const allowedIdentifiers = new Set(
        allowedExisting.map((item) =>
          typeof item === 'object' && item !== null ? (item.filename || item.url) : String(item)
        )
      );

      // Filter existing images against allowed identifiers (resolves strictly against existing DB record)
      retainedImages = listing.images.filter((img) =>
        allowedIdentifiers.has(img.filename) || allowedIdentifiers.has(img.url)
      );
    }

    // Process newly uploaded files
    const rawImageFiles = req.files?.images || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'images' || !f.fieldname) : []);
    const rawVideoFiles = req.files?.video || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'video') : []);

    const newImages = rawImageFiles.map((file) => ({
      url: `/uploads/listings/${file.filename}`,
      filename: file.filename,
    }));

    const finalImages = [...retainedImages, ...newImages];

    if (finalImages.length < 1) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'A listing must have at least one image' });
    }
    if (finalImages.length > 5) {
      await deleteUploadedFiles(req.files);
      return res.status(400).json({ message: 'Maximum 5 images allowed per listing' });
    }

    // Process video update (replace, remove, or retain)
    let updatedVideo = listing.video;
    let oldVideoToClean = null;

    if (rawVideoFiles.length > 0) {
      const vFile = rawVideoFiles[0];
      if (listing.video?.filename) {
        oldVideoToClean = listing.video.filename;
      }
      updatedVideo = {
        url: `/uploads/listings/${vFile.filename}`,
        filename: vFile.filename,
        mimeType: vFile.videoMeta?.mimeType || vFile.mimetype || 'video/mp4',
        size: vFile.size || 0,
        duration: vFile.videoMeta?.duration ?? null,
        posterUrl: '',
      };
    } else if (req.body.removeVideo === 'true' || req.body.removeVideo === true) {
      if (listing.video?.filename) {
        oldVideoToClean = listing.video.filename;
      }
      updatedVideo = null;
    }

    // Determine removed files to delete from disk after DB update succeeds
    const removedImages = listing.images.filter(
      (orig) => !finalImages.some((f) => (f.filename && f.filename === orig.filename) || f.url === orig.url)
    );

    // Update text and pricing fields (pricing locked if bidding is active)
    const allowed = ['title', 'description', 'category', 'condition'];
    if (!hasBids) {
      allowed.push('reservePrice', 'minBidIncrement');
    }
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        if (k === 'category') listing[k] = req.body[k].toLowerCase().trim();
        else if (k === 'condition') listing[k] = req.body[k].toLowerCase().trim().replace(/\s+/g, '-');
        else listing[k] = req.body[k];
      }
    });

    listing.images = finalImages;
    listing.video = updatedVideo;
    await listing.save();

    // Delete removed files from disk only after successful DB update
    for (const removed of removedImages) {
      if (removed.filename) {
        await deleteListingFile(removed.filename);
      }
    }
    if (oldVideoToClean) {
      await deleteListingFile(oldVideoToClean);
    }

    res.json({ listing });
  } catch (err) {
    await deleteUploadedFiles(req.files);
    next(err);
  }
};

// PATCH /api/listings/:id/cancel
// Allows sellers to cancel scheduled listings or active listings with 0 bids
exports.cancelListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Ownership check
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Only the seller or an admin can cancel this listing' });
    }

    // Already cancelled check
    if (listing.status === 'cancelled') {
      return res.status(400).json({ message: 'This listing is already cancelled' });
    }

    // Closed/completed check
    if (listing.status === 'closed' || listing.status === 'completed' || listing.status === 'unsold') {
      return res.status(400).json({ message: `Cannot cancel an auction that has already ended (${listing.status})` });
    }

    // If active, check if any bids were placed
    if (listing.status === 'active') {
      const bidCount = await Bid.countDocuments({ listing: listing._id });
      if (bidCount > 0) {
        return res.status(400).json({
          message: `This auction cannot be cancelled because bidding has already started (${bidCount} bid${bidCount === 1 ? '' : 's'} placed).`,
        });
      }
    }

    // Execute cancellation
    const now = new Date();
    listing.status = 'cancelled';
    listing.cancelledAt = now;
    listing.cancellationReason = req.body.reason?.trim() || 'Cancelled by seller';
    await listing.save();

    // Broadcast cancellation over Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`auction:${listing._id}`).emit('auction:cancelled', {
        listingId: listing._id,
        reason: listing.cancellationReason,
        cancelledAt: listing.cancelledAt,
      });
      io.to(`auction:${listing._id}`).emit('auction:status_change', {
        listingId: listing._id,
        status: 'cancelled',
      });
    }

    res.json({
      message: 'Listing cancelled successfully',
      listing,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/listings/:id
exports.deleteListing = async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ message: 'Listing not found' });
    if (
      listing.seller.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({ message: 'Not authorised' });
    }

    const bidCount = await Bid.countDocuments({ listing: listing._id });
    if (bidCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a listing with active bids' });
    }

    const imagesToDelete = (listing.images && Array.isArray(listing.images)) ? [...listing.images] : [];
    const videoToDelete = listing.video?.filename;

    await listing.deleteOne();

    // Remove associated image files and video from disk after DB deletion
    for (const img of imagesToDelete) {
      if (img.filename) {
        await deleteListingFile(img.filename);
      }
    }
    if (videoToDelete) {
      await deleteListingFile(videoToDelete);
    }

    res.json({ message: 'Listing deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /api/listings/my — seller's own listings with status filtering and bid counts
exports.myListings = async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { seller: req.user._id };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const listings = await Listing.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with bid counts
    const listingIds = listings.map((l) => l._id);
    const bidCounts = await Bid.aggregate([
      { $match: { listing: { $in: listingIds } } },
      { $group: { _id: '$listing', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    bidCounts.forEach((b) => {
      countMap[b._id.toString()] = b.count;
    });

    const enriched = listings.map((l) => ({
      ...l,
      bidCount: countMap[l._id.toString()] || 0,
    }));

    res.json({ listings: enriched });
  } catch (err) {
    next(err);
  }
};
