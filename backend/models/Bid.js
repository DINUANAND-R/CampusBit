const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    bidder: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    isLateBid: { type: Boolean, default: false }, // placed in last 30 s
    triggeredExtension: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bidSchema.index({ listing: 1, createdAt: -1 });
bidSchema.index({ bidder: 1, createdAt: -1 });

module.exports = mongoose.model('Bid', bidSchema);
