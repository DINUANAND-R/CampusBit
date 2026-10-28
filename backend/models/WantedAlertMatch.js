const mongoose = require('mongoose');

const wantedAlertMatchSchema = new mongoose.Schema(
  {
    alert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WantedAlert',
      required: true,
      index: true,
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    matchReason: {
      type: String,
      default: '',
    },
    startingPrice: {
      type: Number,
      default: null,
    },
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      default: null,
    },
  },
  { timestamps: true }
);

// Unique compound index: prevents duplicate match records for the same alert and listing
wantedAlertMatchSchema.index({ alert: 1, listing: 1 }, { unique: true });
wantedAlertMatchSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('WantedAlertMatch', wantedAlertMatchSchema);
