/**
 * SWIPE ACTION MODEL
 *
 * Mongoose schema recording a single swipe decision. Every like or pass in the
 * application is persisted here, and mutual likes are what the swipe endpoint
 * reads back to decide whether a `Match` or `GroupMatch` should be created.
 *
 * The schema covers three directions of swipe, tagged by `swipeType`:
 *   - 'user_to_user'  : userId  -> targetUserId
 *   - 'user_to_group' : userId  -> targetGroupId
 *   - 'group_to_user' : groupId -> targetUserId
 * Because only one actor field and one target field apply to any given swipe,
 * the four id fields are conditionally required against each other rather than
 * unconditionally required.
 *
 * Connections:
 *   - server/models/User.js, Group.js       - actors and targets.
 *   - server/models/Match.js, GroupMatch.js - created when a like is reciprocated.
 *   - server/index.js                       - /api/swipe and /api/group/:groupId/swipe.
 *   - client/src/components/SwipeCard.tsx   - the UI that emits these actions.
 *
 * Notes:
 *   - Sparse unique indexes prevent a duplicate swipe on the same target while
 *     still allowing the unused id combinations to be absent.
 *   - `isUndo` and the 'superlike' action are carried over from an earlier
 *     revision and are not currently exercised by any endpoint.
 */

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

/**
 * Pre-save hook: strip the group fields from a plain user-to-user swipe.
 *
 * Mongoose would otherwise persist them as explicit nulls, and a null value
 * participates in the sparse unique indexes above - meaning a user's second
 * user-to-user swipe would collide with their first on the (userId,
 * targetGroupId) index. Deleting the keys keeps those documents out of the
 * group indexes entirely.
 */
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