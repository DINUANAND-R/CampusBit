const Listing = require('../models/Listing');
const User = require('../models/User');
const Notification = require('../models/Notification');
const NotificationJob = require('../models/NotificationJob');

let globalIO = null;

const setIO = (io) => {
  globalIO = io;
};

const getIO = () => globalIO;

/**
 * Checks whether a listing is currently published and eligible for public notification.
 */
const isListingPubliclyEligible = (listing) => {
  if (!listing) return false;
  if (listing.status !== 'active') return false;
  if (listing.isModerated) return false;

  const now = new Date();
  if (listing.publishAt && new Date(listing.publishAt) > now) return false;
  if (listing.endsAt && new Date(listing.endsAt) <= now) return false;

  return true;
};

/**
 * Enqueues or starts a durable notification campaign for a newly published listing.
 * Idempotent: safe against concurrent callers, retries, and restarts.
 */
const queueNewListingNotification = async (listingDocOrId, ioInstance = null) => {
  try {
    const io = ioInstance || getIO();
    const listingId = listingDocOrId?._id || listingDocOrId;

    const listing = await Listing.findById(listingId).populate('seller', 'username avatarUrl');
    if (!listing) {
      return { success: false, reason: 'Listing not found' };
    }

    if (!isListingPubliclyEligible(listing)) {
      return { success: false, reason: 'Listing is not active or publicly eligible' };
    }

    const sellerId = listing.seller?._id || listing.seller;

    // 1. Idempotently find or create the durable NotificationJob
    let job = await NotificationJob.findOne({ listing: listing._id, type: 'NEW_LISTING' });

    if (!job) {
      try {
        job = await NotificationJob.create({
          listing: listing._id,
          seller: sellerId,
          type: 'NEW_LISTING',
          status: 'PENDING',
          batchSize: 100,
        });
      } catch (err) {
        if (err.code === 11000) {
          // Already created by concurrent call
          job = await NotificationJob.findOne({ listing: listing._id, type: 'NEW_LISTING' });
        } else {
          throw err;
        }
      }
    }

    if (!job) {
      return { success: false, reason: 'Could not create or find notification job' };
    }

    if (job.status === 'COMPLETED') {
      return { success: true, message: 'Notification campaign already completed', job };
    }

    // 2. Dispatch job execution asynchronously in the background
    setImmediate(() => {
      processNotificationJob(job._id, io).catch((err) => {
        console.error(`[NotificationService] Error executing job ${job._id}:`, err);
      });
    });

    return { success: true, queued: true, jobId: job._id };
  } catch (err) {
    console.error('[NotificationService] queueNewListingNotification error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Processes a NotificationJob in bounded batches through eligible registered users.
 */
const processNotificationJob = async (jobId, ioInstance = null) => {
  const io = ioInstance || getIO();

  const job = await NotificationJob.findOneAndUpdate(
    { _id: jobId, status: { $in: ['PENDING', 'PROCESSING', 'FAILED'] } },
    { status: 'PROCESSING' },
    { new: true }
  );

  if (!job) return;

  try {
    const listing = await Listing.findById(job.listing).populate('seller', 'username avatarUrl');
    if (!listing || !isListingPubliclyEligible(listing)) {
      job.status = 'FAILED';
      job.error = 'Listing is missing or no longer eligible for public notification';
      await job.save();
      return;
    }

    const sellerName = listing.seller?.username || 'A campus seller';
    const thumbnailUrl = listing.images?.[0]?.url || '';
    const startingPrice = listing.startingPrice;
    const title = `New product listed: ${listing.title}`;
    const message = `${sellerName} has listed a ${listing.title} starting at ₹${startingPrice}.`;
    const link = `/listings/${listing._id}`;
    const deduplicationKey = `new_listing:${listing._id}`;

    // Process users in bounded batches using cursor pagination on _id
    let hasMore = true;

    while (hasMore) {
      const userFilter = {
        _id: { $ne: job.seller },
        status: 'active', // Only eligible, active users
      };

      if (job.lastProcessedUserId) {
        userFilter._id = { $gt: job.lastProcessedUserId, $ne: job.seller };
      }

      const users = await User.find(userFilter)
        .select('_id username')
        .sort({ _id: 1 })
        .limit(job.batchSize)
        .lean();

      if (!users || users.length === 0) {
        hasMore = false;
        break;
      }

      // Build bulk upsert operations with stable idempotency keys
      const bulkOps = users.map((u) => ({
        updateOne: {
          filter: {
            recipient: u._id,
            deduplicationKey,
          },
          update: {
            $setOnInsert: {
              recipient: u._id,
              sender: job.seller,
              type: 'NEW_LISTING',
              title,
              message,
              link,
              listing: listing._id,
              imageUrl: thumbnailUrl,
              startingPrice,
              isRead: false,
              deduplicationKey,
            },
          },
          upsert: true,
        },
      }));

      await Notification.bulkWrite(bulkOps, { ordered: false });

      // Real-time broadcast to online recipients in their personal room
      if (io) {
        users.forEach((u) => {
          io.to(`user:${u._id}`).emit('notification:new', {
            type: 'NEW_LISTING',
            title,
            message,
            link,
            listingId: listing._id,
            imageUrl: thumbnailUrl,
            startingPrice,
            createdAt: new Date(),
          });
        });
      }

      // Update checkpoint in the job document
      job.processedCount += users.length;
      job.lastProcessedUserId = users[users.length - 1]._id;
      await job.save();

      if (users.length < job.batchSize) {
        hasMore = false;
        break;
      }
    }

    job.status = 'COMPLETED';
    job.completedAt = new Date();
    await job.save();

    console.log(
      `🔔 [NotificationService] Campaign completed for "${listing.title}" (${job.processedCount} users notified)`
    );
  } catch (err) {
    console.error(`[NotificationService] Failed processing job ${jobId}:`, err);
    job.status = 'FAILED';
    job.retries = (job.retries || 0) + 1;
    job.error = err.message;
    await job.save().catch(() => {});
  }
};

/**
 * Recovers and resumes incomplete notification jobs across server reboots.
 */
const resumePendingJobs = async (ioInstance = null) => {
  try {
    const io = ioInstance || getIO();
    const pendingJobs = await NotificationJob.find({
      status: { $in: ['PENDING', 'PROCESSING'] },
    });

    if (pendingJobs.length > 0) {
      console.log(`🔄 [NotificationService] Recovering ${pendingJobs.length} incomplete notification jobs...`);
      for (const job of pendingJobs) {
        await processNotificationJob(job._id, io);
      }
    }
  } catch (err) {
    console.error('[NotificationService] Error in resumePendingJobs:', err);
  }
};

module.exports = {
  setIO,
  getIO,
  queueNewListingNotification,
  processNotificationJob,
  resumePendingJobs,
  isListingPubliclyEligible,
};
