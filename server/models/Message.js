/**
 * MESSAGE MODEL - MongoDB schema for storing chat messages between matched users
 * Handles message creation, storage, and retrieval for conversation threads.
 * Manages message metadata including sender, receiver, timestamps, and read status.
 * Supports both individual user messaging and group conversations.
 * Provides foundation for real-time chat features and conversation history loading.
 */


//Document: Message
//Fields: 
// senderId
// receiverId
// groupId
// content -> every object is a singular message
// messageType
// isRead -> isRead.user1 or isRead.user2
// readBy
// editedAt
// isDeleted: 
// createdAt (auto from timestamps: true)
// updatedAt (auto from timestamps: true)


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

messageSchema.methods.markAsRead = function(userId) {
  if (!this.readBy.some(reader => reader.userId.equals(userId))) {
    this.readBy.push({ userId, readAt: new Date() });
  }
  if (userId.equals(this.receiverId)) {
    this.isRead = true;
  }
};

module.exports = mongoose.model('Message', messageSchema);