/**
 * GROUP JOIN REQUEST MODEL
 *
 * Mongoose schema for a user asking to join a group that already exists. This is
 * the inbound counterpart to `GroupRequest`: `GroupRequest` is two individuals
 * agreeing to form a new group, whereas this record is an outsider knocking on
 * the door of an established one - typically after finding it by invite code or
 * through search.
 *
 * The request sits in 'pending' until a member of the group accepts or rejects
 * it; acceptance adds the requester to `Group.memberIds`.
 *
 * Connections:
 *   - server/models/Group.js - the group being asked to join.
 *   - server/models/User.js  - the requester.
 *   - server/index.js        - /api/groups/:groupId/join-requests and the group
 *                              invite/accept endpoints; also emitted over
 *                              Socket.io so members see requests live.
 *   - client/src/components/GroupManagement.tsx - review and response UI.
 *
 * Notes:
 *   - The (groupId, requester) index is non-unique, so a user who was rejected
 *     may apply again later.
 */
const mongoose = require('mongoose');

const groupJoinRequestSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, { timestamps: true });

groupJoinRequestSchema.index({ groupId: 1, requester: 1 });

module.exports = mongoose.model('GroupJoinRequest', groupJoinRequestSchema);
