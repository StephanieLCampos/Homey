/**
 * GROUP MODEL
 *
 * Mongoose schema for a shared roommate profile formed by two or more matched
 * users. Once a group exists it becomes the unit that swipes and is swiped on;
 * the individual profiles of its members are paused for the duration.
 *
 * A group owns two independent status flags, both derived automatically in the
 * pre-save hook rather than set by callers:
 *   - `target_status`: 'full' | 'not_full'  - whether memberIds has reached maxMembers.
 *   - `group_status` : 'active' | 'paused'  - a full group is paused so it stops
 *                                             appearing in and sending likes.
 *
 * `pendingVotes` is a Map keyed by proposed-user id, each holding the ballots
 * cast so far. This backs the democratic add-a-member flow: a proposal is
 * opened, every current member votes, and a majority admits the candidate.
 *
 * Connections:
 *   - server/models/User.js        - `memberIds` and the reciprocal `User.groupId`.
 *   - server/models/SwipeAction.js - group swipes, cleaned up when the group fills.
 *   - server/models/GroupMatch.js  - pending group-to-user matches.
 *   - server/index.js              - group creation, voting, invite and leave endpoints.
 *   - client/src/components/GroupManagement.tsx - primary consumer in the UI.
 *
 * Notes:
 *   - `inviteCode` is generated on first save and is the shareable join code.
 *   - `preferences` intentionally duplicates the field list of the user
 *     preferences schema so groups and users can be compared with one code path.
 */

const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  memberIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  preferences: {
    minAge: { type: Number, required: true, min: 18, max: 100 },
    maxAge: { type: Number, required: true, min: 18, max: 100 },
    preferredGender: [{ type: String, enum: ['male', 'female', 'non-binary', 'other'] }],
    maxRent: { type: Number, required: true, min: 0 },
    cleanlinessLevel: { type: Number, required: true, min: 1, max: 5 },
    noiseTolerance: { type: Number, required: true, min: 1, max: 5 },
    petFriendly: { type: Boolean, required: true },
    smokingAllowed: { type: Boolean, required: true },
    location: {
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String },
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  },
  photos: [{
    type: String,
    validate: {
      validator: function(v) {
        // Accept absolute http(s) URLs, relative paths like /images/..., or data URLs (base64)
        return /^https?:\/\/.+/.test(v) || /^\/[^\/].+/.test(v) || /^data:image\/.+;base64,/.test(v);
      },
      message: 'Photo must be a valid URL, relative path, or data URL'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  maxMembers: {
    type: Number,
    default: 8,
    min: 2,
    max: 8
  },
  target_status: {
    type: String,
    enum: ['full', 'not_full'],
    default: 'not_full'
  },
  group_status: {
    type: String,
    enum: ['active', 'paused'],
    default: 'active'
  },
  pendingVotes: {
    type: Map,
    of: [{
      voterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      vote: { type: String, enum: ['yes', 'no'] },
      createdAt: { type: Date, default: Date.now }
    }],
    default: new Map()
  },
  inviteCode: {
    type: String,
    unique: true
  }
}, {
  timestamps: true
});

/**
 * Pre-save hook: assign an invite code on first save and keep the derived
 * status fields consistent with the member list.
 *
 * When the group transitions from not-full to full it flags `_needsCleanup`;
 * the corresponding post-save hook then runs `cleanupWhenFull()`. The work is
 * deferred to post-save because it touches other collections and must not run
 * until this document has actually been persisted.
 */
groupSchema.pre('save', function(next) {
  if (!this.inviteCode) {
    this.inviteCode = Math.random().toString(36).substr(2, 8).toUpperCase();
  }
  
  // Check if group was full before this change
  const wasFull = this.target_status === 'full';
  
  // Automatically update target_status based on member count
  this.target_status = this.memberIds.length >= this.maxMembers ? 'full' : 'not_full';
  
  // Automatically update group_status - pause when full
  this.group_status = this.target_status === 'full' ? 'paused' : 'active';
  
  // If group just became full, schedule cleanup
  if (!wasFull && this.target_status === 'full') {
    this._needsCleanup = true;
  }
  
  next();
});

/** Post-save hook: run the deferred cleanup flagged by the pre-save hook. */
groupSchema.post('save', async function() {
  if (this._needsCleanup) {
    await this.cleanupWhenFull();
    this._needsCleanup = false;
  }
});

/** @returns {boolean} true when the group still has room for another member. */
groupSchema.methods.canAddMember = function() {
  return this.memberIds.length < this.maxMembers;
};

/**
 * Append a user to the group and refresh the derived status flags.
 * @param {ObjectId} userId - user to add.
 * @returns {boolean} false if the group is full or already contains the user.
 */
groupSchema.methods.addMember = function(userId) {
  if (this.canAddMember() && !this.memberIds.includes(userId)) {
    this.memberIds.push(userId);
    // Update target_status and group_status after adding member
    this.target_status = this.memberIds.length >= this.maxMembers ? 'full' : 'not_full';
    this.group_status = this.target_status === 'full' ? 'paused' : 'active';
    return true;
  }
  return false;
};

/**
 * Remove a user from the group and refresh the derived status flags. Removing a
 * member from a full group re-opens it for matching.
 * @param {ObjectId} userId - user to remove.
 */
groupSchema.methods.removeMember = function(userId) {
  this.memberIds = this.memberIds.filter(id => !id.equals(userId));
  // Update target_status and group_status after removing member
  this.target_status = this.memberIds.length >= this.maxMembers ? 'full' : 'not_full';
  this.group_status = this.target_status === 'full' ? 'paused' : 'active';
};

/** @returns {boolean} true when the group has reached `maxMembers`. */
groupSchema.methods.isFull = function() {
  return this.target_status === 'full';
};

/** @returns {boolean} true when the group is paused and hidden from matching. */
groupSchema.methods.isPaused = function() {
  return this.group_status === 'paused';
};

/**
 * A group may only swipe on candidates while it is active, unpaused and still
 * has an open slot to fill.
 * @returns {boolean} true when the group is eligible to send likes.
 */
groupSchema.methods.canSendLikes = function() {
  return this.isActive && this.group_status === 'active' && this.target_status === 'not_full';
};

/**
 * Discard outbound state that is no longer meaningful once the group is full:
 * its own outstanding group-to-user swipes and any group matches still pending.
 * Without this, a full group would keep generating matches it cannot honour.
 *
 * The models are required lazily inside the method to avoid a circular import
 * between Group, SwipeAction and GroupMatch at module load time.
 */
groupSchema.methods.cleanupWhenFull = async function() {
  if (this.target_status === 'full') {
    const SwipeAction = require('./SwipeAction');
    const GroupMatch = require('./GroupMatch');
    
    // Delete group's pending swipes
    await SwipeAction.deleteMany({ 
      groupId: this._id,
      swipeType: 'group_to_user'
    });
    
    // Delete pending group matches
    await GroupMatch.deleteMany({ 
      groupId: this._id,
      status: 'pending'
    });
    
    console.log(`Cleaned up swipes and matches for full group ${this._id}`);
  }
};

groupSchema.index({ memberIds: 1 });
groupSchema.index({ isActive: 1 });
groupSchema.index({ target_status: 1 });
groupSchema.index({ group_status: 1 });

module.exports = mongoose.model('Group', groupSchema);