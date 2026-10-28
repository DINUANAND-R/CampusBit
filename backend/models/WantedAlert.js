const mongoose = require('mongoose');

const wantedAlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    keywords: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    category: {
      type: String,
      enum: ['all', 'books', 'electronics', 'clothing', 'furniture', 'sports', 'other'],
      default: 'all',
    },
    maxBudget: {
      type: Number,
      required: true,
      min: 1,
    },
    condition: {
      type: String,
      enum: ['any', 'new', 'like-new', 'good', 'fair'],
      default: 'any',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'PAUSED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    matchCount: {
      type: Number,
      default: 0,
    },
    lastMatchedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Compound indexes for fast query filtering and candidate alert matching
wantedAlertSchema.index({ user: 1, createdAt: -1 });
wantedAlertSchema.index({ status: 1, expiresAt: 1, maxBudget: 1 });
wantedAlertSchema.index({ category: 1, status: 1 });

// Helper to determine if alert is currently active and unexpired
wantedAlertSchema.methods.isEligible = function () {
  const now = new Date();
  return this.status === 'ACTIVE' && this.expiresAt > now;
};

module.exports = mongoose.model('WantedAlert', wantedAlertSchema);
