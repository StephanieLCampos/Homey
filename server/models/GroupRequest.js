/**
 * GROUP REQUEST MODEL
 *
 * Mongoose schema for one user inviting another matched user to form a group
 * together. This is the step that precedes a group existing at all: two matched
 * individuals must agree before a `Group` document is created.
 *
 * Lifecycle: a requester sends a request to a recipient (optionally with a short
 * message); on acceptance the responding endpoint creates the group, records its
 * id in `groupId`, stamps `respondedAt`, and moves both users to 'in_group'.
 *
 * Connections:
 *   - server/models/User.js  - requester and recipient.
 *   - server/models/Group.js - populated on `groupId` once the request succeeds.
 *   - server/index.js        - /api/group-requests and the respond endpoint.
 *   - client/src/components/MessagingInterface.tsx - surfaces requests in-thread.
 *
 * Notes:
 *   - The unique (requester, recipient, status) index blocks a second request in
 *     the same state between the same pair, while still permitting a fresh
 *     request after an earlier one was rejected.
 *   - The 'expired' status is defined for parity with the match models but is
 *     not currently applied by a background job.
 */
const mongoose = require('mongoose');

const groupRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  message: {
    type: String,
    maxlength: 500,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
groupRequestSchema.index({ requester: 1, recipient: 1 });
groupRequestSchema.index({ recipient: 1, status: 1 });
groupRequestSchema.index({ status: 1, requestedAt: 1 });

// Prevent duplicate requests between same users
groupRequestSchema.index({ requester: 1, recipient: 1, status: 1 }, { unique: true });

module.exports = mongoose.model('GroupRequest', groupRequestSchema);