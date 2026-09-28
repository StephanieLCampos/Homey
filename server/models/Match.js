/**
 * MATCH MODEL
 *
 * Mongoose schema for a user-to-user match. A match document is created by the
 * swipe endpoint the moment two users have both liked each other, and it is the
 * record that unlocks a direct conversation between them.
 *
 * Status lifecycle:
 *   pending  -> created on a mutual like, awaiting explicit acceptance
 *   accepted -> both parties confirmed; messaging is enabled
 *   rejected -> declined or unmatched by either party
 *   expired  -> `expiresAt` has passed (7 days from creation)
 *
 * Connections:
 *   - server/models/SwipeAction.js - the mutual likes that trigger a match.
 *   - server/models/Message.js     - conversations are keyed off an accepted match.
 *   - server/models/GroupMatch.js  - the equivalent record for group-to-user matches.
 *   - server/index.js              - /api/swipe, /api/users/:id/matches, accept,
 *                                    decline and unmatch endpoints.
 *   - client/src/components/MatchesList.tsx - renders these records.
 *
 * Notes:
 *   - The unique compound index on (userId1, userId2) is order-sensitive, so the
 *     endpoints that create matches normalise the pair before querying.
 *   - `compatibilityScore` is reserved for a future weighted-scoring model; the
 *     current matching flow uses the hard filter in `User.isCompatibleWith` and
 *     leaves this field at its default of 0.
 */


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

/** @returns {boolean} true once the match has passed its 7-day expiry window. */
matchSchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

module.exports = mongoose.model('Match', matchSchema);