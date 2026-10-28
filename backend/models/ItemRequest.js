const mongoose = require('mongoose');

const itemRequestSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120,
    },
    category: {
      type: String,
      required: true,
      enum: ['textbooks', 'electronics', 'furniture', 'clothing', 'sports', 'notes', 'other', 'books', 'appliances'],
      default: 'other',
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1500,
    },
    budgetMin: {
      type: Number,
      default: null,
      min: 0,
    },
    budgetMax: {
      type: Number,
      default: null,
      min: 0,
    },
    neededBy: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['OPEN', 'FULFILLED', 'CANCELLED'],
      default: 'OPEN',
      index: true,
    },
    fulfilledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

itemRequestSchema.index({ status: 1, createdAt: -1 });
itemRequestSchema.index({ requester: 1, status: 1 });
itemRequestSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('ItemRequest', itemRequestSchema);
