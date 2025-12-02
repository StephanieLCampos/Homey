/**
 * GROUP MATCH MODEL - MongoDB schema for tracking matches involving groups
 * Handles group-to-user matches where groups like users and users accept
 * Manages match status, group expansion when users join groups via matches
 * Extends matching system to support group dynamics and member additions
 */

const mongoose = require('mongoose');

const groupMatchSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  initiatedBy: {
    type: String,
    enum: ['group', 'user'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  // Store which group member initiated the like (if initiated by group)
  groupMemberInitiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }
  }
}, {
  timestamps: true
});

groupMatchSchema.index({ groupId: 1, userId: 1 }, { unique: true });
groupMatchSchema.index({ status: 1 });
groupMatchSchema.index({ expiresAt: 1 });
groupMatchSchema.index({ groupId: 1, status: 1 });
groupMatchSchema.index({ userId: 1, status: 1 });

groupMatchSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

module.exports = mongoose.model('GroupMatch', groupMatchSchema);