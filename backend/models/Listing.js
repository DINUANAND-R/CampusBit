const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, maxlength: 2000 },
    category: {
      type: String,
      required: true,
      enum: ['books', 'electronics', 'clothing', 'furniture', 'sports', 'other'],
    },
    condition: {
      type: String,
      required: true,
      enum: ['new', 'like-new', 'good', 'fair'],
    },
    images: [{ type: String }], // URLs
    startingPrice: { type: Number, required: true, min: 1 },
    reservePrice: { type: Number, default: null }, // null = no reserve
    minBidIncrement: { type: Number, default: 10, min: 1 },
    currentPrice: { type: Number },
    leadingBid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', default: null },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['draft', 'active', 'closed', 'unsold', 'completed'],
      default: 'active',
    },
    startAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    extensionCount: { type: Number, default: 0 },
    maxExtensions: { type: Number, default: 10 },
  },
  { timestamps: true, optimisticConcurrency: true }
);

// Set currentPrice to startingPrice on first save
listingSchema.pre('save', function () {
  if (this.isNew && (this.currentPrice === undefined || this.currentPrice === null)) {
    this.currentPrice = this.startingPrice;
  }
});

// Indexes
listingSchema.index({ status: 1, endsAt: 1 });
listingSchema.index({ seller: 1 });
listingSchema.index({ title: 'text', description: 'text' });
listingSchema.index({ category: 1 });

module.exports = mongoose.model('Listing', listingSchema);
