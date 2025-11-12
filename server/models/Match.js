/**
 * MATCH MODEL - MongoDB schema for tracking user relationships and match status
 * Manages match creation when users mutually like each other through swipe actions.
 * Handles match acceptance, rejection, and status updates for pending matches.
 * Stores match timestamps, user references, and enables conversation list population.
 * Provides relationship tracking foundation for messaging and group formation features.
 */ 
// delete: unmatching users or expired matches after 7 days occurs

// NEED TO FIX: ensure that if a user swipe right on another user, that had alrieady swiped right on them, 
//it automatically creates a match and the move to the messages tab

//document: Model
// fields:
// userId1
// userId2
// status: pending, accepted, rejected or expired
// compatibilityScore -> N/A
// expiresAt
// CreatedAt (auto-added by Mongoose timestamps)
// updatedAt (auto-added by Mongoose timestamps)



const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  userId1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userId2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  compatibilityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
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

matchSchema.index({ userId1: 1, userId2: 1 }, { unique: true });
matchSchema.index({ status: 1 });
matchSchema.index({ expiresAt: 1 });

matchSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

module.exports = mongoose.model('Match', matchSchema);