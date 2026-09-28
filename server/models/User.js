/**
 * USER MODEL
 *
 * Mongoose schema for an individual member of the platform. A user document
 * carries three distinct groups of data:
 *   1. Identity and credentials  - email, bcrypt-hashed password, last login.
 *   2. Public profile            - name, age, gender, bio, photo URLs.
 *   3. Roommate preferences      - the embedded `preferencesSchema` used by the
 *                                  compatibility filter in the matching flow.
 *
 * The schema also owns two pieces of lifecycle state that the rest of the
 * application keys off:
 *   - `status`        : 'individual' | 'in_group' | 'seeking_group'
 *   - `profileStatus` : 'active' | 'paused' | 'deactivated'
 * A user who joins a group is moved to 'in_group' / 'paused' so that they stop
 * surfacing in other users' swipe decks while the group represents them.
 *
 * Connections:
 *   - server/routes/auth.js        - registration, login, profile updates.
 *   - server/middleware/auth.js    - loads the user for every authenticated request.
 *   - server/index.js              - matching, swiping, group and messaging endpoints.
 *   - server/models/Group.js       - `groupId` references the user's current group.
 *   - client/src/types/index.ts    - `UserData` mirrors the shape returned by
 *                                    `toSafeObject()`.
 *
 * Notes:
 *   - `isActive` is retained purely for backward compatibility with earlier
 *     revisions; `profileStatus` is the authoritative flag and the two are kept
 *     in sync by the callers that mutate them.
 *   - Passwords are hashed by a pre-save hook, so plaintext must never be
 *     written via `findByIdAndUpdate` (that path bypasses the hook).
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Embedded sub-document describing the kind of roommate and living situation a
 * user is looking for. Stored inline on the user rather than in its own
 * collection because preferences are never queried independently of their owner.
 * `Group.preferences` deliberately mirrors these fields so that a group can be
 * matched with the same comparison logic as an individual.
 */
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
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Please enter a valid email']
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
        return /^https?:\/\/.+/.test(v) || /^\/[^\/].+/.test(v) || /^data:image\/.+/.test(v);
      },
      message: 'Photo must be a valid URL, relative path, or base64 data URL'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  profileStatus: {
    type: String,
    enum: ['active', 'paused', 'deactivated'],
    default: 'active'
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

/**
 * Pre-save hook: hash the password whenever it is set or changed.
 * Guarded by `isModified` so that unrelated profile updates do not re-hash an
 * already-hashed value.
 */
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

/**
 * Pre-save hook: derive a 0-100 "profile completeness" score from which fields
 * the user has filled in. The weights are fixed and sum to 100; the score is
 * surfaced in the UI to nudge users toward finishing their profile.
 */
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

/**
 * Verify a plaintext password against the stored bcrypt hash.
 * @param {string} candidatePassword - password supplied at login.
 * @returns {Promise<boolean>} true when the password matches.
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Hard compatibility filter used to build a user's swipe deck.
 *
 * This is a symmetric, all-or-nothing check rather than a score: both users
 * must fall inside each other's age range and preferred-gender list, their
 * cleanliness and noise ratings must be within two points of one another, and
 * their pet and smoking preferences must agree exactly. Any single failure
 * removes the candidate from consideration.
 *
 * @param {Object} otherUser - the candidate user document being evaluated.
 * @returns {boolean} true when the two users are mutually compatible.
 */
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

/**
 * Serialise the document for transport to the client: strips the password hash
 * and the Mongoose version key, and renames `_id` to `id` so the payload
 * matches the `UserData` interface the front end expects.
 * @returns {Object} client-safe plain object.
 */
userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.password;
  // Convert _id to id for frontend compatibility
  userObject.id = userObject._id.toString();
  delete userObject._id;
  delete userObject.__v;
  return userObject;
};

userSchema.index({ 'preferences.location.city': 1, 'preferences.location.state': 1 });
userSchema.index({ age: 1 });
userSchema.index({ gender: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model('User', userSchema);