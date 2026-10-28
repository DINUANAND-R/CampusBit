const mongoose = require('mongoose');

const proxyBidSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      index: true,
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    maxAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['active', 'outbid', 'won', 'cancelled'],
      default: 'active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce at most one proxy bid commitment per buyer per listing
proxyBidSchema.index({ listing: 1, bidder: 1 }, { unique: true });

// Optimize query for highest proxy bid with deterministic timestamp tie-break
proxyBidSchema.index({ listing: 1, status: 1, maxAmount: -1, createdAt: 1 });

module.exports = mongoose.model('ProxyBid', proxyBidSchema);
