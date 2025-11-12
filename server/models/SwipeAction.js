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
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['like', 'dislike', 'superlike'],
    required: true
  },
  isUndo: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

swipeActionSchema.index({ userId: 1, targetUserId: 1 }, { unique: true });
swipeActionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('SwipeAction', swipeActionSchema);