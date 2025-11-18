/**
 * AUTHENTICATION MIDDLEWARE - JWT token validation for protected routes
 * Verifies Bearer tokens in request headers against JWT_SECRET from environment.
 * Extracts user information from valid tokens and attaches to req.user for downstream handlers.
 * Returns 401 Unauthorized for missing/invalid tokens and 500 for server errors during validation.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    if (user.profileStatus === 'deactivated') {
      return res.status(401).json({ error: 'Account is deactivated.' });
    }

    req.user = user;
    req.userId = user._id.toString();
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired.' });
    }
    res.status(500).json({ error: 'Server error during authentication.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.profileStatus !== 'deactivated') {
      req.user = user;
      req.userId = user._id.toString();
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authMiddleware, optionalAuth };