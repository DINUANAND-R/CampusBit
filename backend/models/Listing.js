const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String, default: '' },
  },
  { _id: false }
);

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
    images: {
      type: [imageSchema],
      set: (val) =>
        Array.isArray(val)
          ? val.map((x) => (typeof x === 'string' ? { url: x, filename: '' } : x))
          : val,
      validate: {
        validator: function (val) {
          if (this.status === 'draft') return true;
          if (!this.isModified('images') && !this.isNew) return true;
          return Array.isArray(val) && val.length >= 1 && val.length <= 5;
        },
        message: 'A listing must have between 1 and 5 images',
      },
      default: [],
    },
    startingPrice: { type: Number, required: true, min: 1 },
    reservePrice: { type: Number, default: null }, // null = no reserve
    minBidIncrement: { type: Number, default: 10, min: 1 },
    currentPrice: { type: Number },
    leadingBid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', default: null },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'closed', 'unsold', 'completed', 'cancelled'],
      default: 'active',
    },
    publishAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, trim: true, default: '' },
    viewsCount: { type: Number, default: 0 },
    viewedIps: { type: [String], default: [] },
    isModerated: { type: Boolean, default: false },
    moderationReason: { type: String, default: '' },
    moderatedAt: { type: Date, default: null },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  // If active and publishedAt not set, default publishedAt to now
  if (this.status === 'active' && !this.publishedAt) {
    this.publishedAt = this.publishedAt || new Date();
  }
});

// Indexes
listingSchema.index({ status: 1, publishAt: 1 });
listingSchema.index({ status: 1, endsAt: 1 });
listingSchema.index({ isModerated: 1 });
listingSchema.index({ seller: 1, createdAt: -1 });
listingSchema.index({ title: 'text', description: 'text' });
listingSchema.index({ category: 1 });

module.exports = mongoose.model('Listing', listingSchema);
