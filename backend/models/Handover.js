const mongoose = require('mongoose');

const handoverSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true, unique: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    finalPrice: { type: Number, required: true },
    sellerDecision: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    handoverCode: { type: String, default: null }, // 6-digit OTP, set when approved
    completedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Handover', handoverSchema);
