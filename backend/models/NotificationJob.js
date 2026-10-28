const mongoose = require('mongoose');

const notificationJobSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['NEW_LISTING'],
      default: 'NEW_LISTING',
    },
    status: {
      type: String,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    totalEligible: {
      type: Number,
      default: 0,
    },
    processedCount: {
      type: Number,
      default: 0,
    },
    lastProcessedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    batchSize: {
      type: Number,
      default: 100,
    },
    retries: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: '',
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Idempotent: exactly one notification job per listing and type
notificationJobSchema.index({ listing: 1, type: 1 }, { unique: true });
notificationJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('NotificationJob', notificationJobSchema);
