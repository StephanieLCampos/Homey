/**
 * AUTHENTICATION ROUTES
 *
 * Express router mounted at /api/auth by server/index.js. It owns the whole
 * account lifecycle that sits outside the matching domain:
 *   POST /register        - create an account, returns a JWT.
 *   POST /login           - verify credentials, returns a JWT.
 *   GET  /me              - read the authenticated user's profile.
 *   PUT  /me              - update name, bio, photos, age, preferences.
 *   POST /change-password - rotate the password after re-verifying the old one.
 *   POST /profile-status  - pause or reactivate the profile.
 *
 * Every mutating field is validated with express-validator before it reaches
 * the model, and the two unauthenticated routes sit behind a shared rate
 * limiter to blunt credential-stuffing attempts.
 *
 * Connections:
 *   - server/models/User.js     - persistence, password hashing, `toSafeObject`.
 *   - server/middleware/auth.js - protects the authenticated routes below.
 *   - server/index.js           - mounts this router.
 *   - client/src/services/authService.ts - the sole client-side caller.
 *
 * Notes:
 *   - `authLimiter` is currently set to a development-friendly 100 attempts per
 *     15 minutes; it should be tightened before a production deployment.
 *   - Tokens are signed with HS256 and expire after 7 days.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

/**
 * Rate limiter applied to the unauthenticated /register and /login routes.
 * Deliberately loose for local development - see the note in the file header.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased limit for development - change back to 5 for production
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Mint a signed JWT for a user.
 * The payload carries only the user id; the middleware re-reads the account from
 * the database on each request, so no profile data is embedded in the token.
 *
 * @param {ObjectId|string} userId - subject of the token.
 * @returns {string} signed HS256 token valid for 7 days.
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { 
      expiresIn: '7d',
      algorithm: 'HS256'
    }
  );
};

/**
 * POST /api/auth/register
 *
 * Create a new account. Validates the payload, rejects a duplicate email and an
 * inverted age range, then persists the user - the model's pre-save hook hashes
 * the password. New users with no uploaded photo are given the bundled default
 * avatar so that their card renders correctly in the swipe deck.
 *
 * @returns 201 with { token, user } on success; 400 on validation or duplicate
 *          email; 500 on an unexpected failure.
 */
router.post('/register', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('age').isInt({ min: 18, max: 100 }).withMessage('Age must be between 18 and 100'),
  body('gender').isIn(['male', 'female', 'non-binary', 'other']).withMessage('Invalid gender'),
  body('preferences').isObject().withMessage('Preferences must be an object'),
  body('preferences.minAge').isInt({ min: 18, max: 100 }).withMessage('Minimum age must be between 18 and 100'),
  body('preferences.maxAge').isInt({ min: 18, max: 100 }).withMessage('Maximum age must be between 18 and 100'),
  body('preferences.location.city').trim().notEmpty().withMessage('City is required'),
  body('preferences.location.state').trim().notEmpty().withMessage('State is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, name, age, gender, bio, photos, preferences } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    if (preferences.minAge > preferences.maxAge) {
      return res.status(400).json({ error: 'Minimum age cannot be greater than maximum age' });
    }

    const finalPhotos = (photos && photos.length > 0) ? photos : ['/default_user.png'];

    const user = new User({
      email,
      password,
      name,
      age,
      gender,
      bio: bio || '',
      photos: finalPhotos,
      preferences
    });

    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/login
 *
 * Verify credentials and issue a token. Failures for an unknown email and for a
 * wrong password return the same generic message so the endpoint does not
 * disclose which addresses are registered.
 *
 * Logging in also reactivates a paused or deactivated profile, on the
 * assumption that returning to the app signals intent to be visible again.
 *
 * @returns 200 with { token, user }; 401 on bad credentials.
 */
router.post('/login', authLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Auto-reactivate paused and deactivated accounts when user logs back in
    if (user.profileStatus === 'paused' || user.profileStatus === 'deactivated') {
      user.profileStatus = 'active';
      user.isActive = true; // Keep for backward compatibility
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

/**
 * GET /api/auth/me
 * Return the authenticated user's own profile. The middleware has already
 * loaded and validated the account, so this simply serialises it.
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.toSafeObject()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/auth/me
 *
 * Update the authenticated user's profile. Only the fields in `allowedUpdates`
 * are copied out of the request body - an explicit allow-list, so that a caller
 * cannot smuggle in privileged fields such as `status`, `groupId` or `password`.
 *
 * @returns 200 with the updated user; 400 on validation failure.
 */
router.put('/me', authMiddleware, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('bio').optional().isLength({ max: 1000 }).withMessage('Bio must not exceed 1000 characters'),
  body('photos').optional().isArray().withMessage('Photos must be an array'),
  body('age').optional().isInt({ min: 18, max: 100 }).withMessage('Age must be between 18 and 100'),
  body('preferences').optional().isObject().withMessage('Preferences must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const allowedUpdates = ['name', 'bio', 'photos', 'age', 'preferences'];
    const updates = {};

    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    if (updates.preferences && req.user.preferences) {
      if (updates.preferences.minAge > updates.preferences.maxAge) {
        return res.status(400).json({ error: 'Minimum age cannot be greater than maximum age' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error during profile update' });
  }
});

/**
 * POST /api/auth/change-password
 *
 * Rotate the password after re-verifying the current one. The new value is
 * assigned to the document and saved (rather than written with an update query)
 * so that the model's pre-save hashing hook runs.
 *
 * @returns 200 on success; 400 when the current password is incorrect.
 */
router.post('/change-password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.userId);
    const isPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error during password change' });
  }
});


/**
 * POST /api/auth/profile-status
 *
 * Pause or reactivate the profile, controlling whether the user appears in
 * other people's swipe decks.
 *
 * A user who belongs to a group may not reactivate manually: while in a group
 * the group represents them in matching, so their individual profile is
 * intentionally held paused until they leave.
 *
 * @returns 200 on success; 400 for an invalid status or while in a group.
 */
router.post('/profile-status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or paused' });
    }

    // Don't allow manual status change if user is in a group
    const user = await User.findById(req.userId);
    if (user.status === 'in_group' && status === 'active') {
      return res.status(400).json({ error: 'Cannot activate profile while in a group. Leave the group first.' });
    }

    await User.findByIdAndUpdate(req.userId, { 
      profileStatus: status,
      isActive: status === 'active' // Keep for backward compatibility
    });

    res.json({
      success: true,
      message: `Profile ${status === 'active' ? 'activated' : 'paused'} successfully`
    });

  } catch (error) {
    console.error('Update profile status error:', error);
    res.status(500).json({ error: 'Server error during profile status update' });
  }
});

module.exports = router;