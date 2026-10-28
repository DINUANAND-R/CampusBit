const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'SUSPEND_USER',
        'REINSTATE_USER',
        'BAN_USER',
        'CHANGE_ROLE',
        'MODERATE_LISTING',
        'RESTORE_LISTING',
        'RESOLVE_REPORT',
        'DISMISS_REPORT',
      ],
      index: true,
    },
    targetType: {
      type: String,
      enum: ['user', 'listing', 'report'],
      required: true,
    },
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    targetName: {
      type: String,
      default: '',
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
