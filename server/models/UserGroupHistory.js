/**
 * USER GROUP HISTORY MODEL
 *
 * Archive of the individual matching state a user had before joining a group.
 *
 * When a user joins a group their personal swipes and matches are deleted, so
 * that the group - not the individual - is the thing being matched. Deleting
 * that state outright would be irreversible, so the affected `SwipeAction` and
 * `Match` documents are snapshotted here first, embedded verbatim rather than
 * referenced (the originals no longer exist to reference).
 *
 * `joinedAt` / `leftAt` bracket the membership period; a record with no `leftAt`
 * describes a membership that is still current. When a user leaves the group,
 * the leave endpoint reads the matching snapshot back to restore their prior
 * swipe history.
 *
 * Connections:
 *   - server/models/User.js, Group.js       - the membership being recorded.
 *   - server/models/SwipeAction.js, Match.js - shape of the archived documents.
 *   - server/index.js                        - written on join, read on leave.
 *
 * Notes:
 *   - Restoration is best-effort: matches whose counterpart user has since been
 *     deleted or has joined a group of their own are not revived.
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