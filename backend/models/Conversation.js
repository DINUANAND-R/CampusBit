const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['auction', 'direct', 'request'],
      default: 'direct',
      required: true,
      index: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    // For auction-specific discussions
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      default: null,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    // For looking-for-item discussions
    itemRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ItemRequest',
      default: null,
      index: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: '',
      maxlength: 300,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Blocked status or moderation
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
// Fast lookup of conversations by participant
conversationSchema.index({ participants: 1, updatedAt: -1 });

// Ensure unique conversation per listing + buyer for auction discussions
conversationSchema.index(
  { listing: 1, buyer: 1 },
  {
    unique: true,
    partialFilterExpression: {
      listing: { $type: 'objectId' },
      buyer: { $type: 'objectId' },
      type: 'auction',
    },
  }
);

// Helper method to check if a user is participant
conversationSchema.methods.hasParticipant = function (userId) {
  if (!userId) return false;
  const uid = userId.toString();
  return this.participants.some((p) => (p._id || p).toString() === uid);
};

module.exports = mongoose.model('Conversation', conversationSchema);
