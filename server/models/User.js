/**
 * USER MODEL - MongoDB schema and database operations for user profiles
 * Defines user document structure with personal info, preferences, photos, and status tracking.
 * Handles user registration, authentication, profile updates, and roommate preference management.
 * Includes password hashing with bcrypt, photo URL storage, and user activation/deactivation.
 * Supports age, gender, cleanliness, noise tolerance, pet/smoking preferences for matching.
 */
// deletes user accounts
// Handles password hashing and verification and authetication
// removes password before sending user data to frontend

//Model: User
//document fields:
// email
// password (hashed)
// name
// age
// gender
// bio
// photos
// preferences (minAge, maxAge, maxRent, etc.)
// groupId (if they’re in a group)
// isActive, status

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const preferencesSchema = new mongoose.Schema({
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
});

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  age: {
    type: Number,
    required: true,
    min: 18,
    max: 100
  },
  gender: {
    type: String,
    required: true,
    enum: ['male', 'female', 'non-binary', 'other']
  },
  bio: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  photos: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+/.test(v) || /^\/[^\/].+/.test(v);
      },
      message: 'Photo must be a valid URL or relative path'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  preferences: {
    type: preferencesSchema,
    required: true
  },
  status: {
    type: String,
    enum: ['individual', 'in_group', 'seeking_group'],
    default: 'individual'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  profileCompleteness: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.pre('save', function(next) {
  let completeness = 0;
  
  if (this.email) completeness += 15;
  if (this.name) completeness += 15;
  if (this.age) completeness += 10;
  if (this.gender) completeness += 10;
  if (this.bio && this.bio.length > 20) completeness += 15;
  if (this.photos && this.photos.length > 0) completeness += 20;
  if (this.preferences) completeness += 15;
  
  this.profileCompleteness = completeness;
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isCompatibleWith = function(otherUser) {
  const otherPrefs = otherUser.preferences;
  const myPrefs = this.preferences;

  if (this.age < otherPrefs.minAge || this.age > otherPrefs.maxAge) return false;
  if (otherUser.age < myPrefs.minAge || otherUser.age > myPrefs.maxAge) return false;

  if (!otherPrefs.preferredGender.includes(this.gender)) return false;
  if (!myPrefs.preferredGender.includes(otherUser.gender)) return false;

  if (Math.abs(myPrefs.cleanlinessLevel - otherPrefs.cleanlinessLevel) > 2) return false;
  if (Math.abs(myPrefs.noiseTolerance - otherPrefs.noiseTolerance) > 2) return false;

  if (myPrefs.petFriendly !== otherPrefs.petFriendly) return false;
  if (myPrefs.smokingAllowed !== otherPrefs.smokingAllowed) return false;

  return true;
};

userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  // Convert _id to id for frontend compatibility
  userObject.id = userObject._id.toString();
  delete userObject._id;
  delete userObject.__v;
  return userObject;
};

userSchema.index({ email: 1 });
userSchema.index({ 'preferences.location.city': 1, 'preferences.location.state': 1 });
userSchema.index({ age: 1 });
userSchema.index({ gender: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);