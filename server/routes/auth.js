/**
 * AUTHENTICATION ROUTES - Express.js routes for user registration and login
 * Provides secure user registration with email validation and password hashing.
 * Handles user login with JWT token generation and rate limiting for security.
 * Includes input validation, duplicate email prevention, and error handling.
 * Implements password strength requirements and secure token-based authentication flow.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased limit for development - change back to 5 for production
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

    // Auto-reactivate deactivated accounts when user logs back in
    if (user.profileStatus === 'deactivated') {
      user.profileStatus = 'active';
      user.isActive = true; // Keep for backward compatibility
      user.deactivatedAt = null;
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

router.post('/deactivate', authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, { 
      profileStatus: 'deactivated',
      isActive: false, // Keep for backward compatibility
      deactivatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ error: 'Server error during account deactivation' });
  }
});

// Update profile status (pause/activate profile)
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