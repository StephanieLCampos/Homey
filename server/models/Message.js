/**
 * MESSAGE MODEL
 *
 * Mongoose schema for a single chat message. One schema serves both
 * conversation types, distinguished by which recipient field is populated:
 *   - direct message : `receiverId` set, `groupId` absent.
 *   - group message  : `groupId` set, `receiverId` absent.
 *
 * `messageType` additionally allows 'system' messages - automated notices such
 * as "X joined the group" - which have no human sender, which is why
 * `senderId` is only conditionally required.
 *
 * Read tracking is deliberately two-tiered: `isRead` is a simple boolean for the
 * direct-message case, while `readBy` accumulates per-user receipts so a group
 * message can record that each member has seen it independently.
 *
 * Connections:
 *   - server/models/User.js, Group.js - sender, receiver and group references.
 *   - server/index.js                 - POST /api/messages and the conversation
 *                                       retrieval endpoints, plus Socket.io relay.
 *   - client/src/components/MessagingInterface.tsx - renders conversations.
 *
 * Notes:
 *   - `isDeleted` implements soft deletion; queries that surface messages to
 *     users are expected to filter on it rather than removing documents.
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.messageType !== 'system';
    }
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'system'],
    default: 'text'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  editedAt: Date,
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, createdAt: -1 });
messageSchema.index({ groupId: 1, createdAt: -1 });
messageSchema.index({ isRead: 1 });

/**
 * Record that a user has read this message.
 *
 * Appends a receipt to `readBy` (de-duplicated, so re-reading is idempotent),
 * and additionally sets the boolean `isRead` when the reader is the direct
 * recipient - that flag drives unread badges for one-to-one conversations.
 *
 * @param {ObjectId} userId - the user who read the message.
 */
messageSchema.methods.markAsRead = function(userId) {
  if (!this.readBy.some(reader => reader.userId.equals(userId))) {
    this.readBy.push({ userId, readAt: new Date() });
  }
  if (userId.equals(this.receiverId)) {
    this.isRead = true;
  }
};

module.exports = mongoose.model('Message', messageSchema);