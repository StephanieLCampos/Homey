/**
 * USER GROUP HISTORY MODEL - MongoDB schema for storing user data when joining groups
 * Stores likes and matches that were deleted when user joined a group
 * Enables restoration of user's matching history when they leave a group
 * Tracks group membership history and provides data recovery capabilities
 */

const mongoose = require('mongoose');

const userGroupHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  leftAt: {
    type: Date
  },
  // Store deleted swipe actions
  deletedSwipeActions: [{
    _id: mongoose.Schema.Types.ObjectId,
    userId: mongoose.Schema.Types.ObjectId,
    targetUserId: mongoose.Schema.Types.ObjectId,
    action: String,
    swipeType: String,
    createdAt: Date,
    updatedAt: Date
  }],
  // Store deleted matches
  deletedMatches: [{
    _id: mongoose.Schema.Types.ObjectId,
    userId1: mongoose.Schema.Types.ObjectId,
    userId2: mongoose.Schema.Types.ObjectId,
    status: String,
    createdAt: Date,
    updatedAt: Date,
    expiresAt: Date
  }]
}, {
  timestamps: true
});

userGroupHistorySchema.index({ userId: 1 });
userGroupHistorySchema.index({ groupId: 1 });
userGroupHistorySchema.index({ userId: 1, leftAt: 1 });

module.exports = mongoose.model('UserGroupHistory', userGroupHistorySchema);