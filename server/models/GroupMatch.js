/**
 * GROUP MATCH MODEL
 *
 * Mongoose schema for a match between an existing group and an individual user.
 * This is the group-scale counterpart to `Match`: where `Match` pairs two
 * individuals, a `GroupMatch` pairs a group with a prospective new member.
 *
 * `initiatedBy` records which side liked first, which determines who has to
 * accept for the match to complete:
 *   - 'group' - a member swiped on the user on the group's behalf; the user accepts.
 *   - 'user'  - the user swiped on the group; the group's members accept.
 * When `initiatedBy` is 'group', `groupMemberInitiator` preserves which member
 * actually cast the like so the UI can attribute it.
 *
 * Accepting a group match is what physically grows the group - the accept
 * endpoint adds the user to `Group.memberIds` and flips their status to 'in_group'.
 *
 * Connections:
 *   - server/models/Group.js  - the group side of the pairing.
 *   - server/models/User.js   - the candidate being matched.
 *   - server/index.js         - /api/group/:groupId/swipe and the group-match
 *                               accept/decline endpoints.
 *   - client/src/components/MatchesList.tsx, GroupManagement.tsx - UI consumers.
 *
 * Notes:
 *   - The unique (groupId, userId) index means a group and a user can only ever
 *     hold one match record between them.
 *   - Records expire 7 days after creation, matching the individual match window.
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

/** @returns {boolean} true once the group match has passed its 7-day expiry window. */
groupMatchSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

module.exports = mongoose.model('GroupMatch', groupMatchSchema);