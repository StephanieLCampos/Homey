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
    default: 4,
    min: 2,
    max: 10
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
  next();
});

groupSchema.methods.canAddMember = function() {
  return this.memberIds.length < this.maxMembers;
};

groupSchema.methods.addMember = function(userId) {
  if (this.canAddMember() && !this.memberIds.includes(userId)) {
    this.memberIds.push(userId);
    return true;
  }
  return false;
};

groupSchema.methods.removeMember = function(userId) {
  this.memberIds = this.memberIds.filter(id => !id.equals(userId));
};

groupSchema.index({ memberIds: 1 });
groupSchema.index({ isActive: 1 });

module.exports = mongoose.model('Group', groupSchema);