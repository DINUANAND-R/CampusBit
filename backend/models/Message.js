const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: function () {
        return !this.attachments || this.attachments.length === 0;
      },
      trim: true,
      maxlength: 2000,
    },
    attachments: [
      {
        url: { type: String, required: true },
        filename: { type: String, required: true },
        originalName: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
      },
    ],
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Client-side temp ID for deduplication on reconnection / retries
    clientTempId: {
      type: String,
      default: null,
      index: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Indexes
messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ conversation: 1, sender: 1, clientTempId: 1 });

module.exports = mongoose.model('Message', messageSchema);
