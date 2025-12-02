/**
 * GROUP MODEL - MongoDB schema for group roommate profiles and voting system
 * Manages group formation from matched users with democratic member voting system.
 * Implements MongoDB Maps for tracking pending member votes (yes/no) with timestamps.
 * Handles group creation, member management, preference merging, and photo collections.
 * Supports majority-vote acceptance for new members and group profile updates.
 */
// deleting groups
// member voting system using MongoDB maps

//document fields:
// name	
// description	
// memberIds	[ObjectId]	
// preferences	
// photos	[String]	URLs
// isActive	
// maxMembers	
// target_status: 'full' or 'not_full' based on memberIds.length vs maxMembers
// group_status: 'active' or 'paused' (auto-paused when full)
// pendingVotes: Map Proposed user → votes array
// inviteCode: Auto-generated group invite code
// createdAt / updatedAt

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

groupSchema.post('save', async function() {
  if (this._needsCleanup) {
    await this.cleanupWhenFull();
    this._needsCleanup = false;
  }
});

groupSchema.methods.canAddMember = function() {
  return this.memberIds.length < this.maxMembers;
};

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

groupSchema.methods.removeMember = function(userId) {
  this.memberIds = this.memberIds.filter(id => !id.equals(userId));
  // Update target_status and group_status after removing member
  this.target_status = this.memberIds.length >= this.maxMembers ? 'full' : 'not_full';
  this.group_status = this.target_status === 'full' ? 'paused' : 'active';
};

groupSchema.methods.isFull = function() {
  return this.target_status === 'full';
};

groupSchema.methods.isPaused = function() {
  return this.group_status === 'paused';
};

groupSchema.methods.canSendLikes = function() {
  return this.isActive && this.group_status === 'active' && this.target_status === 'not_full';
};

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