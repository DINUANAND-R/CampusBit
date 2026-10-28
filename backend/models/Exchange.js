const mongoose = require('mongoose');

const handoverProposalSchema = new mongoose.Schema(
  {
    proposedDate: { type: Date, required: true },
    proposedTime: { type: String, required: true, trim: true },
    meetingLocation: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    proposedRole: { type: String, enum: ['buyer', 'seller'], default: 'seller' },
    status: {
      type: String,
      enum: ['PENDING', 'PROPOSED', 'ACCEPTED', 'REJECTED', 'DECLINED'],
      default: 'PROPOSED',
    },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' },
  },
  { _id: true, timestamps: true }
);

const historyEntrySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    raisedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' },
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNotes: { type: String, default: '' },
  },
  { _id: false }
);

const exchangeSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      unique: true, // Idempotent: 1 exchange per listing
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    winningBid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bid',
      default: null,
    },
    winningAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'AWAITING_SELLER_CONFIRMATION',
        'READY_TO_ARRANGE',
        'HANDOVER_SCHEDULED',
        'HANDED_OVER',
        'COMPLETED',
        'DISPUTED',
        'CANCELLED',
      ],
      default: 'READY_TO_ARRANGE',
      index: true,
    },
    handoverProposal: {
      type: handoverProposalSchema,
      default: null,
    },
    buyerReceivedAt: {
      type: Date,
      default: null,
    },
    sellerHandedOverAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    dispute: {
      type: disputeSchema,
      default: null,
    },
    history: {
      type: [historyEntrySchema],
      default: [],
    },
  },
  { timestamps: true }
);

exchangeSchema.index({ seller: 1, createdAt: -1 });
exchangeSchema.index({ buyer: 1, createdAt: -1 });
exchangeSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('Exchange', exchangeSchema);
