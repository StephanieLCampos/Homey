/**
 * SWIPE ACTION MODEL - MongoDB schema for recording user swipe decisions (like/dislike)
 * Tracks all swipe actions with user references, target users, and action types.
 * Enables match detection logic by checking mutual likes between users.
 * Stores swipe timestamps for analytics and prevents duplicate swipes on same users.
 * Foundation for the matching algorithm and user preference tracking system.
 */

//NOTE remove dislike and isUndo, undo last swipe


//Document: Swipe Action
//Fields:
// userId: ObjectId (User)
// targetUserId: ObjectId (User)
// action: 'like' or 'dislike'
// isUndo: Boolean, undo the last swipe
// createdAt: Date
// updatedAt: Date


const mongoose = require('mongoose');

const swipeActionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.groupId; // Required if no groupId
    }
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() {
      return !this.userId; // Required if no userId
    },
    default: undefined
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.targetGroupId; // Required if no targetGroupId
    }
  },
  targetGroupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: function() {
      return !this.targetUserId; // Required if no targetUserId
    },
    default: undefined
  },
  action: {
    type: String,
    enum: ['like', 'dislike', 'superlike'],
    required: true
  },
  isUndo: {
    type: Boolean,
    default: false
  },
  swipeType: {
    type: String,
    enum: ['user_to_user', 'user_to_group', 'group_to_user'],
    required: true,
    default: 'user_to_user'
  }
}, {
  timestamps: true
});

// Indexes for different swipe combinations
// Pre-save hook to ensure undefined fields don't become null
swipeActionSchema.pre('save', function(next) {
  // If this is a user_to_user swipe, ensure group fields are not set
  if (this.swipeType === 'user_to_user') {
    this.$unset = this.$unset || {};
    this.$unset.groupId = "";
    this.$unset.targetGroupId = "";
    delete this.groupId;
    delete this.targetGroupId;
  }
  next();
});

swipeActionSchema.index({ userId: 1, targetUserId: 1 }, { unique: true, sparse: true });
swipeActionSchema.index({ userId: 1, targetGroupId: 1 }, { unique: true, sparse: true });
swipeActionSchema.index({ groupId: 1, targetUserId: 1 }, { unique: true, sparse: true });
swipeActionSchema.index({ userId: 1, createdAt: -1 });
swipeActionSchema.index({ groupId: 1, createdAt: -1 });
swipeActionSchema.index({ swipeType: 1 });

module.exports = mongoose.model('SwipeAction', swipeActionSchema);