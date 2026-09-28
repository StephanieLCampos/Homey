/**
 * AUTHENTICATION MIDDLEWARE
 *
 * Express middleware that turns a JWT bearer token into a loaded user document.
 * Exports two variants:
 *   - `authMiddleware` - rejects the request unless a valid token resolves to an
 *                        active user. Used by every protected endpoint.
 *   - `optionalAuth`   - attaches the user when a valid token is present but
 *                        allows anonymous requests through untouched.
 *
 * Both re-read the user from the database on every request rather than trusting
 * the token payload alone. That is deliberate: it means a deleted or
 * deactivated account is rejected immediately, instead of remaining usable
 * until its 7-day token happens to expire.
 *
 * Connections:
 *   - server/models/User.js  - the account lookup.
 *   - server/routes/auth.js  - issues the tokens this module verifies.
 *   - server/index.js        - applied to the protected API surface.
 *   - client/src/services/authService.ts - sends the Authorization header.
 *
 * Notes:
 *   - Requires `JWT_SECRET` in the environment; verification fails closed if it
 *     is missing or does not match the secret used to sign the token.
 *   - Handlers downstream can rely on both `req.user` (document) and
 *     `req.userId` (string form of the id).
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Require a valid bearer token.
 *
 * Responds 401 when the token is missing, malformed, expired, resolves to a user
 * that no longer exists, or resolves to a deactivated account; 500 on an
 * unexpected failure. On success, `req.user` and `req.userId` are populated and
 * control passes to the next handler.
 */
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

/**
 * Attach the authenticated user when possible, but never block the request.
 * Any verification failure is swallowed and the request continues anonymously,
 * so callers must treat `req.user` as optional.
 */
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