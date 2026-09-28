/**
 * SERVER MAIN ENTRY POINT
 *
 * The Express application for Homey. This single file is the backend: it opens
 * the MongoDB connection, mounts the authentication router, defines the whole
 * REST API for matching, groups and messaging, runs the Socket.io server for
 * real-time notifications, and serves the compiled client bundle.
 *
 * Layout of this file, in order:
 *   1. Bootstrap        - environment, database connection, security middleware,
 *                         static file serving, development-only helper routes.
 *   2. Sample data      - `initializeSampleData()` seeds three demo accounts.
 *   3. User endpoints   - profile retrieval, account deactivation.
 *   4. Discovery        - potential matches (the swipe deck) and user search.
 *   5. Swiping          - individual and group swipes; match creation.
 *   6. Matches          - listing, accepting, declining, unmatching.
 *   7. Groups           - creation, member proposals and voting, invites, join
 *                         requests, updates, leaving and dissolution.
 *   8. Messaging        - sending messages, conversation and thread retrieval.
 *   9. Socket.io        - authenticated connections and per-user rooms.
 *  10. Startup          - migrations, admin reset endpoint, listener.
 *
 * Core domain rule enforced throughout: a user is represented either as an
 * individual or by a group, never both. Joining a group pauses the individual
 * profile, deletes that user's outstanding individual swipes and matches (after
 * archiving them to `UserGroupHistory`), and redirects their messaging into the
 * group thread. Leaving reverses the status change but deliberately leaves the
 * old swipes deleted so the user can be rematched fresh.
 *
 * Connections:
 *   - server/models/*           - all eight Mongoose models used here.
 *   - server/routes/auth.js     - mounted at /api/auth.
 *   - server/middleware/auth.js - guards every endpoint below.
 *   - client/src/App.tsx        - primary consumer; holds the Socket.io client.
 *   - client/dist               - the built front end, served statically.
 *
 * Notes:
 *   - Socket.io rooms are named by user id, so `io.to(userId).emit(...)`
 *     addresses one user across all of their open tabs.
 *   - The verbose console logging throughout was added while debugging the group
 *     flows and is intentionally left in place; it should be replaced with a
 *     levelled logger before production use.
 *   - The `/api/debug/*`, `/api/dev/*` and `/api/admin/reset-all` routes are
 *     development aids. The dev and admin routes are disabled when NODE_ENV is
 *     'production'; the debug route is not, and should be removed or guarded.
 *   - Known limitation: this file has grown well past a comfortable size and
 *     would benefit from being split into routers per domain, mirroring the
 *     existing routes/auth.js.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Group = require('./models/Group');
const Match = require('./models/Match');
const SwipeAction = require('./models/SwipeAction');
const GroupMatch = require('./models/GroupMatch');
const UserGroupHistory = require('./models/UserGroupHistory');
const Message = require('./models/Message');
const GroupRequest = require('./models/GroupRequest');
const GroupJoinRequest = require('./models/GroupJoinRequest');
const authRoutes = require('./routes/auth');
const { authMiddleware, optionalAuth } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// ---------------------------------------------------------------------------
// 1. BOOTSTRAP
// ---------------------------------------------------------------------------

// Connect to MongoDB. A failed connection is fatal: the process exits rather
// than serving requests that would all fail at the data layer.
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Helmet sets standard security headers. The default content-security-policy is
// relaxed only for images, so that data: URLs (base64 profile photos uploaded at
// registration) and the Unsplash sample imagery both render.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "https://images.unsplash.com", "https://*.unsplash.com"],
    },
  },
}));

// Rate limiting (disabled for development)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: { error: 'Too many requests, please try again later.' }
// });
// app.use(limiter);

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Serve the compiled React bundle, so a single Express process hosts both the
// API and the front end. Note the path is relative to the process working
// directory, which means the server must be started from within server/.
app.use(express.static('../client/dist'));

// Auth routes
app.use('/api/auth', authRoutes);

// Development-only helpers, compiled out of a production deployment by the
// NODE_ENV guard. `impersonate` mints a token for an arbitrary user so that
// multi-user flows (matching, group voting) can be exercised from one machine.
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/dev/impersonate/:userId', async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select('-password');
      if (!user) return res.status(404).json({ error: 'User not found' });
      const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
      res.json({ token, user: user.toSafeObject ? user.toSafeObject() : user });
    } catch (err) {
      console.error('Dev impersonate error', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // DEV: list all groups for debugging
  app.get('/api/dev/groups', async (req, res) => {
    try {
      const groups = await Group.find({}).lean();
      res.json({ count: groups.length, groups });
    } catch (err) {
      console.error('Dev groups error', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
}

/**
 * GET /api/debug/users
 * Unauthenticated dump of every user with passwords stripped. Used during
 * development to inspect database state from the browser.
 * KNOWN ISSUE: unlike the /api/dev routes above, this is not gated on NODE_ENV
 * and must be removed or guarded before any production deployment.
 */
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await User.find({});
    const safeUsers = users.map(user => {
      const obj = user.toObject();
      delete obj.password;
      return obj;
    });
    res.json({ count: users.length, users: safeUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// 2. SAMPLE DATA
// ---------------------------------------------------------------------------

/**
 * Seed three demonstration accounts (Alex, Sam and Mike) with contrasting
 * preferences, so a freshly-cloned checkout has something to swipe on.
 *
 * The accounts are deleted and recreated on every start rather than only
 * inserted when missing. That keeps the fixtures in step with the current schema
 * as fields are added, at the cost of discarding any changes made to those three
 * accounts between restarts. Users are saved one at a time rather than with
 * `insertMany` so that the model's password-hashing pre-save hook runs.
 */
const initializeSampleData = async () => {
  try {
    // Clear and recreate sample users to ensure they have all required fields
    await User.deleteMany({ email: { $in: ['alex@example.com', 'sam@example.com', 'mike@example.com'] } });
    
    const existingSampleUsers = await User.find({ email: { $in: ['alex@example.com', 'sam@example.com', 'mike@example.com'] } });
    if (existingSampleUsers.length === 0) {
      console.log('Initializing sample data...');
      
      const sampleUsers = [
        {
          email: 'alex@example.com',
          password: 'password123',
          name: 'Alex Johnson',
          age: 25,
          gender: 'non-binary',
          bio: 'Looking for a clean, quiet place to call home. Love cooking and reading!',
          photos: ['/default_user.png'],
          preferences: {
            minAge: 20,
            maxAge: 30,
            preferredGender: ['female', 'non-binary'],
            maxRent: 2000,
            cleanlinessLevel: 4,
            noiseTolerance: 3,
            petFriendly: true,
            smokingAllowed: false,
            location: { city: 'San Francisco', state: 'CA' }
          }
        },
        {
          email: 'sam@example.com',
          password: 'password123',
          name: 'Sam Chen',
          age: 23,
          gender: 'female',
          bio: 'Grad student who needs a study-friendly environment. Pet lover!',
          photos: ['/default_user.png'],
          preferences: {
            minAge: 22,
            maxAge: 28,
            preferredGender: ['male', 'non-binary'],
            maxRent: 1800,
            cleanlinessLevel: 3,
            noiseTolerance: 4,
            petFriendly: false,
            smokingAllowed: false,
            location: { city: 'San Francisco', state: 'CA' }
          }
        },
        {
          email: 'mike@example.com',
          password: 'password123',
          name: 'Mike Rodriguez',
          age: 27,
          gender: 'male',
          bio: 'Professional who values cleanliness and organization. Non-smoker.',
          photos: ['/default_user.png'],
          preferences: {
            minAge: 21,
            maxAge: 32,
            preferredGender: ['male', 'female'],
            maxRent: 2200,
            cleanlinessLevel: 5,
            noiseTolerance: 2,
            petFriendly: true,
            smokingAllowed: true,
            location: { city: 'San Francisco', state: 'CA' }
          }
        }
      ];

      // Create users one by one to trigger password hashing middleware
      for (const userData of sampleUsers) {
        const user = new User(userData);
        await user.save();
      }
      console.log('Sample data initialized successfully');
    }
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
};

// ---------------------------------------------------------------------------
// 3. USER ENDPOINTS
// ---------------------------------------------------------------------------

/**
 * GET /api/user/:id
 *
 * Fetch a user profile. A user may always read their own record; another user's
 * record is only readable once the two hold an accepted match. This prevents the
 * endpoint from being used to enumerate profiles outside the swipe flow.
 *
 * @returns 200 with the safe user object; 403 when not matched; 404 if unknown.
 */
app.get('/api/user/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Users can only view their own profile unless they're matched
    if (req.userId !== req.params.id) {
      const existingMatch = await Match.findOne({
        $or: [
          { userId1: req.userId, userId2: req.params.id },
          { userId1: req.params.id, userId2: req.userId }
        ],
        status: 'accepted'
      });
      
      if (!existingMatch) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    res.json(user.toSafeObject());
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/user/:id/deactivate
 *
 * Deactivate the caller's own account and erase their relational footprint.
 * Runs as an ordered sequence, each step tolerant of the previous one having
 * found nothing:
 *   1. If the user belongs to a group, remove them, post a system message to the
 *      group thread and notify the remaining members over Socket.io.
 *   2. Delete every swipe action, individual match and group match that involves
 *      the user or the group they were representing.
 *   3. Delete private messages only - group messages are preserved so that the
 *      remaining members keep a coherent conversation history.
 *   4. Delete outstanding group requests, join requests and history records.
 *   5. Flip the user to profileStatus 'deactivated' and clear their group link.
 *
 * The account document itself is retained rather than dropped, so the email
 * address stays reserved and any stale JWT is rejected by the auth middleware.
 *
 * @returns 200 with a message describing what happened; 403 for another user's
 *          account; 404 if the account is already gone.
 */
app.post('/api/user/:id/deactivate', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Ensure user can only deactivate their own account
    if (req.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    console.log('Deactivating account for user:', userId);
    
    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Handle group removal if user is in a group
    let groupRemovalMessage = '';
    if (user.status === 'in_group' && user.groupId) {
      console.log('User is in a group. Removing from group...');
      
      try {
        const group = await Group.findById(user.groupId);
        if (group) {
          // Remove user from group
          group.memberIds = group.memberIds.filter(memberId => memberId.toString() !== userId);
          
          // Update group status based on new member count
          group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
          group.group_status = group.target_status === 'full' ? 'paused' : 'active';
          
          await group.save();
          groupRemovalMessage = ' You have been removed from your group.';
          console.log(`User ${userId} removed from group ${user.groupId}`);
          
          // Add system message to group chat that user has left
          const systemMessage = new Message({
            senderId: null, // System message
            groupId: user.groupId,
            content: `${user.name} has left the group chat`,
            messageType: 'system'
          });
          await systemMessage.save();
          
          // Notify remaining group members via Socket.io
          group.memberIds.forEach(memberId => {
            io.to(memberId.toString()).emit('memberLeft', {
              groupId: group._id,
              leftUserId: userId,
              leftUserName: user.name
            });
            
            // Send the system message to group chat
            io.to(memberId.toString()).emit('message', systemMessage);
          });
          
          console.log(`System message sent to ${group.memberIds.length} remaining group members`);
        }
      } catch (groupError) {
        console.error('Error removing user from group:', groupError);
        // Continue with deactivation even if group removal fails
      }
    }
    
    console.log('User can be deactivated. Cleaning up data...');
    
    // Delete all SwipeActions involving this user (individual and group swipes)
    const deletedSwipes = await SwipeAction.deleteMany({ 
      $or: [
        { userId: userId },                    // Swipes sent by this user
        { targetUserId: userId },              // Swipes received by this user
        { groupId: user.groupId },             // Swipes sent by user's group (if they were in one)
        { targetGroupId: user.groupId }        // Swipes received by user's group (if they were in one)
      ]
    });
    console.log(`Deleted ${deletedSwipes.deletedCount} swipe actions`);
    
    // Delete all individual matches involving this user (pending and accepted)
    const deletedMatches = await Match.deleteMany({
      $or: [
        { userId1: userId },
        { userId2: userId }
      ]
    });
    console.log(`Deleted ${deletedMatches.deletedCount} individual matches`);
    
    // Delete all group matches involving this user or their group
    const deletedGroupMatches = await GroupMatch.deleteMany({
      $or: [
        { userId: userId },                    // Group matches where this user was the target
        { groupId: user.groupId }              // Group matches involving user's group (if they were in one)
      ]
    });
    console.log(`Deleted ${deletedGroupMatches.deletedCount} group matches`);
    
    // Delete only private messages (1-on-1), keep group messages
    const deletedMessages = await Message.deleteMany({
      $or: [
        // Private messages sent by this user (has receiverId, no groupId)
        { senderId: userId, receiverId: { $exists: true, $ne: null }, groupId: { $exists: false } },
        // Private messages received by this user (has receiverId, no groupId)  
        { receiverId: userId, groupId: { $exists: false } }
      ]
    });
    console.log(`Deleted ${deletedMessages.deletedCount} private messages (group messages preserved)`);
    
    // Delete all group requests involving this user (sent or received)
    const deletedGroupRequests = await GroupRequest.deleteMany({
      $or: [
        { requester: userId },
        { recipient: userId }
      ]
    });
    console.log(`Deleted ${deletedGroupRequests.deletedCount} group requests`);
    
    // Delete all group join requests involving this user
    const deletedJoinRequests = await GroupJoinRequest.deleteMany({
      requester: userId
    });
    console.log(`Deleted ${deletedJoinRequests.deletedCount} group join requests`);
    
    // Delete user group history records
    const deletedHistory = await UserGroupHistory.deleteMany({
      userId: userId
    });
    console.log(`Deleted ${deletedHistory.deletedCount} user group history records`);
    
    // Update user status to deactivated and remove from group
    await User.findByIdAndUpdate(userId, {
      profileStatus: 'deactivated',
      isActive: false,
      status: 'individual',  // Reset to individual status
      groupId: null          // Remove group association
    });
    
    console.log(`User ${userId} account deactivated successfully`);
    
    res.json({ 
      success: true, 
      message: `Account deactivated successfully.${groupRemovalMessage} You have been logged out.`
    });
  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// 4. DISCOVERY
// ---------------------------------------------------------------------------

/**
 * GET /api/users/:id/potential-matches
 *
 * Build the swipe deck for a user. The deck is assembled in three stages:
 *   1. Exclusions - everyone the user has already swiped on, plus everyone they
 *      already hold a match with, is collected into `excludedUserIds`.
 *   2. Individual candidates - active, unpaused users who are not in a group and
 *      are not excluded. Optional query-string filters (age range, rent,
 *      cleanliness, noise, pets, smoking, gender, city, state) narrow this
 *      further; city and state are matched case-insensitively.
 *   3. Group candidates - active, not-full groups the user does not belong to,
 *      flattened into the same card shape with `isGroup: true` and an id
 *      prefixed `group_` so the client can tell the two apart.
 *
 * A failure while loading groups is caught and the individual results are
 * returned alone, so a group-side problem cannot empty a user's deck.
 *
 * Note: `User.isCompatibleWith` is deliberately not applied here. The strict
 * filter proved too aggressive on a small user base and left decks empty, so
 * candidates are surfaced broadly and the explicit filters do the narrowing;
 * the disabled call is left in place as a reference.
 *
 * @returns 200 with an array of user and group cards; 403 for another user's deck.
 */
app.get('/api/users/:id/potential-matches', authMiddleware, async (req, res) => {
  try {
    console.log('Auth check:', { reqUserId: req.userId, paramsId: req.params.id });
    if (req.userId !== req.params.id) {
      console.log('Access denied: User ID mismatch');
      return res.status(403).json({ error: 'Access denied' });
    }

    const currentUser = await User.findById(req.params.id);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Current user:', currentUser.name, currentUser.email);

    // Get users already swiped on
    const swipedUserIds = await SwipeAction.find({ userId: req.params.id }).distinct('targetUserId');
    console.log('Swiped user IDs:', swipedUserIds);
    
    // Get users you've already matched with (both pending and accepted)
    const matchedUsers = await Match.find({
      $or: [
        { userId1: req.params.id },
        { userId2: req.params.id }
      ]
    });
    const matchedUserIds = matchedUsers.map(match => 
      match.userId1.toString() === req.params.id ? match.userId2 : match.userId1
    );
    console.log('Matched user IDs:', matchedUserIds);
    
    // Combine all excluded user IDs
    const excludedUserIds = [...swipedUserIds, ...matchedUserIds];
    console.log('All excluded user IDs:', excludedUserIds);
    
    // Build filter query from query parameters
    const filterQuery = {
      _id: { 
        $ne: req.params.id,
        $nin: excludedUserIds  // Exclude swiped and matched users
      }, 
      profileStatus: 'active', // Only show active profiles (not paused or deactivated)
      isActive: true, // Keep for backward compatibility
      $or: [
        { groupId: { $exists: false } },
        { groupId: null }
      ]
    };

    // Add filtering based on query parameters
    if (req.query.minAge) {
      filterQuery.age = { ...filterQuery.age, $gte: parseInt(req.query.minAge) };
    }
    if (req.query.maxAge) {
      filterQuery.age = { ...filterQuery.age, $lte: parseInt(req.query.maxAge) };
    }
    if (req.query.maxRent) {
      filterQuery['preferences.maxRent'] = { $lte: parseInt(req.query.maxRent) };
    }
    if (req.query.cleanlinessLevel) {
      filterQuery['preferences.cleanlinessLevel'] = { $gte: parseInt(req.query.cleanlinessLevel) };
    }
    if (req.query.noiseTolerance) {
      filterQuery['preferences.noiseTolerance'] = { $gte: parseInt(req.query.noiseTolerance) };
    }
    if (req.query.petFriendly !== undefined) {
      filterQuery['preferences.petFriendly'] = req.query.petFriendly === 'true';
    }
    if (req.query.smokingAllowed !== undefined) {
      filterQuery['preferences.smokingAllowed'] = req.query.smokingAllowed === 'true';
    }
    if (req.query.preferredGender) {
      const genders = req.query.preferredGender.split(',');
      filterQuery.gender = { $in: genders };
    }
    if (req.query.city) {
      filterQuery['preferences.location.city'] = new RegExp(req.query.city, 'i');
    }
    if (req.query.state) {
      filterQuery['preferences.location.state'] = new RegExp(req.query.state, 'i');
    }

    console.log('Filter query:', JSON.stringify(filterQuery, null, 2));

    // Find potential matches with filters applied
    const potentialMatches = await User.find(filterQuery);
    console.log('Found potential matches:', potentialMatches.length);
    console.log('User names:', potentialMatches.map(u => u.name));

    // For now, show all potential matches (not just compatible ones)
    // You can uncomment the compatibility filter below if needed:
    // const compatibleMatches = potentialMatches.filter(user => 
    //   currentUser.isCompatibleWith(user)
    // );

    const result = potentialMatches.map(user => user.toSafeObject());
    console.log('Returning:', result.length, 'matches');
    // ----- NEW: also include active group summaries so groups appear in swipe feed -----
    try {
      const candidateGroups = await Group.find({
        isActive: true,
        group_status: 'active', // Only show active groups (not paused when full)
        target_status: 'not_full', // Only show groups that are not full
        memberIds: { $nin: [req.params.id] }
      }).limit(50).lean();

      console.log('Potential-matches: found candidateGroups count=', (candidateGroups || []).length);

      // Only include groups that are not full and can accept new members
      const groupEntries = (candidateGroups || []).map(g => {
        const memberCount = Array.isArray(g.memberIds) ? g.memberIds.length : 0;
        const maxMembers = g.maxMembers || 4;
        return {
          id: `group_${g._id}`,
          _id: `group_${g._id}`,
          isGroup: true,
          groupId: g._id,
          name: g.name,
          email: '',
          age: null,
          gender: 'group',
          bio: g.description || '',
          photos: g.photos || [],
          preferences: g.preferences || {},
          isActive: g.isActive,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          isFull: memberCount >= maxMembers,
          memberCount,
          maxMembers
        };
      });

      const combined = [...result, ...groupEntries];
      console.log(`Added ${groupEntries.length} group(s) into potential matches for user ${req.params.id}`);
      res.json(combined);
    } catch (err) {
      console.error('Error loading candidate groups for potential matches:', err);
      res.json(result);
    }
    // --------------------------------------------------------------------------
  } catch (error) {
    console.error('Get potential matches error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/users/search?email=...
 *
 * Look a user up by exact email address, case-insensitively, excluding the
 * caller. Used by the invite flow where one user already knows another's
 * address. Exact-match only by design - it is a direct lookup, not a browse.
 *
 * @returns 200 with an array of at most one user; 400 when email is absent.
 */
app.get('/api/users/search', authMiddleware, async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Search for users by email (case insensitive, exact match)
    const users = await User.find({
      email: new RegExp(`^${email.trim()}$`, 'i'),
      _id: { $ne: req.userId }, // Exclude the current user
    });

    // Return safe user objects
    const results = users.map(user => user.toSafeObject());
    
    console.log(`Search for email "${email}" returned ${results.length} results`);
    res.json(results);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// 5. SWIPING AND MATCH CREATION
// ---------------------------------------------------------------------------

/**
 * POST /api/swipe
 *
 * Record an individual user-to-user swipe and create a match if it is mutual.
 *
 * Members of a group are blocked from sending individual likes: while in a
 * group they must swipe as the group via /api/group/:groupId/swipe, so that a
 * candidate is not courted by a member and their group at the same time.
 *
 * The swipe is upserted - re-swiping the same way is rejected as a duplicate,
 * while swiping the other way updates the existing record. New swipes are
 * inserted through the raw collection driver rather than the Mongoose model:
 * Mongoose would write explicit nulls for the unused groupId / targetGroupId
 * fields, and those nulls collide on the sparse unique indexes the second time
 * a user swipes.
 *
 * On a like, the reciprocal swipe is looked up; if it exists the pair is
 * upgraded to an accepted `Match` immediately (mutual intent needs no further
 * confirmation) and both parties are notified over their Socket.io rooms.
 *
 * @body   {string} targetUserId, {string} action - 'like' | 'dislike' | 'superlike'
 * @returns 200 with { success, match, matchId? }; 400 on a duplicate swipe or a
 *          group member attempting an individual like.
 */
app.post('/api/swipe', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, action } = req.body;
    const userId = req.userId;
    
    if (!['like', 'dislike', 'superlike'].includes(action)) {
      return res.status(400).json({ error: 'Invalid swipe action' });
    }

    // Check if target user exists and is active
    const targetUser = await User.findById(targetUserId);
    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ error: 'Target user not found or inactive' });
    }

    // Check if user is in a group and trying to like individual users (block all individual likes from group members)
    if (action === 'like' || action === 'superlike') {
      const currentUser = await User.findById(userId);
      if (currentUser && currentUser.status === 'in_group' && currentUser.groupId) {
        return res.status(400).json({ 
          error: 'You cannot send individual likes while in a group. Use group likes instead.' 
        });
      }
    }

    // Handle swipe action
    console.log(`🔍 Processing swipe action: ${userId} -> ${targetUserId} (${action})`);
    
    try {
      // Find existing swipe
      let existingSwipe = await SwipeAction.findOne({ 
        userId, 
        targetUserId, 
        swipeType: 'user_to_user'
      });

      if (existingSwipe) {
        // Update existing swipe
        if (existingSwipe.action === action) {
          console.log(`⚠️ User already swiped ${action} on this user`);
          return res.status(400).json({ error: 'Already swiped on this user' });
        }
        existingSwipe.action = action;
        await existingSwipe.save();
        console.log('✅ Updated existing swipe action');
      } else {
        // Create new swipe using raw MongoDB to avoid Mongoose setting nulls
        const swipeData = {
          userId: new mongoose.Types.ObjectId(userId),
          targetUserId: new mongoose.Types.ObjectId(targetUserId),
          action,
          swipeType: 'user_to_user',
          isUndo: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Insert without groupId or targetGroupId fields at all
        const result = await mongoose.connection.collection('swipeactions').insertOne(swipeData);
        existingSwipe = await SwipeAction.findById(result.insertedId);
        console.log('✅ Created new swipe action');
      }
    } catch (swipeError) {
      console.error('❌ Error processing swipe action:', swipeError);
      console.error('Error details:', {
        userId,
        targetUserId,
        action,
        errorCode: swipeError.code,
        keyPattern: swipeError.keyPattern,
        keyValue: swipeError.keyValue
      });
      return res.status(500).json({ 
        error: 'Server error', 
        details: swipeError.message 
      });
    }
    
    // Check for match if it's a like
    if (action === 'like' || action === 'superlike') {
      const reverseSwipe = await SwipeAction.findOne({
        userId: targetUserId,
        targetUserId: userId,
        action: { $in: ['like', 'superlike'] }
      });
      
      if (reverseSwipe) {
        console.log(`🎯 Creating automatic match between ${userId} and ${targetUserId}`);
        
        // Check if a match already exists between these users
        const existingMatch = await Match.findOne({
          $or: [
            { userId1: userId, userId2: targetUserId },
            { userId1: targetUserId, userId2: userId }
          ]
        });
        
        if (existingMatch) {
          console.log(`💕 Match already exists with ID: ${existingMatch._id}, updating status to accepted`);
          existingMatch.status = 'accepted';
          await existingMatch.save();
          
          // Notify both users via socket
          io.to(userId).emit('match', existingMatch);
          io.to(targetUserId).emit('match', existingMatch);
          
          return res.json({ 
            success: true, 
            match: true, 
            matchId: existingMatch._id 
          });
        } else {
          // Create automatic match - since both users liked each other, auto-accept it
          console.log(`➕ Creating new match: ${userId} <-> ${targetUserId}`);
          try {
            const match = new Match({
              userId1: userId,
              userId2: targetUserId,
              status: 'accepted' // Auto-accept mutual likes
            });
            
            await match.save();
            console.log(`💕 Automatic match created with ID: ${match._id}`);
            
            // Notify both users via socket
            io.to(userId).emit('match', match);
            io.to(targetUserId).emit('match', match);
            
            return res.json({ 
              success: true, 
              match: true, 
              matchId: match._id 
            });
          } catch (matchError) {
            console.error('❌ Error creating match:', matchError);
            throw matchError;
          }
        }
      }
    }
    
    res.json({ success: true, match: false });
  } catch (error) {
    console.error('Swipe error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

/**
 * POST /api/group/:groupId/swipe
 *
 * Record a swipe cast on behalf of a group by one of its members.
 *
 * Before accepting the swipe the handler reconciles the member list against the
 * users collection and drops any ids whose accounts no longer exist. Stale
 * members would otherwise inflate the count and make the group look full,
 * silently preventing it from ever swiping again.
 *
 * The group must then pass `canSendLikes()` (active, unpaused, not full), and
 * the target must be an active individual - a user already in a group cannot be
 * recruited into a second one.
 *
 * Unlike individual swiping, a group like does not wait for reciprocity: it
 * creates a pending `GroupMatch` straight away, which surfaces to the target as
 * an invitation for them to accept or decline.
 *
 * @returns 200 with { success, groupMatch, groupMatchId? }; 400 when the group
 *          is full; 403 when the caller is not a member.
 */
app.post('/api/group/:groupId/swipe', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, action } = req.body;
    const { groupId } = req.params;
    const userId = req.userId;
    
    if (!['like', 'dislike', 'superlike'].includes(action)) {
      return res.status(400).json({ error: 'Invalid swipe action' });
    }

    // Check if user is a member of the group
    const group = await Group.findById(groupId);
    if (!group || !group.memberIds.includes(userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    // Check if group can send likes (not full/paused)
    // First validate that all members still exist
    const validMembers = [];
    for (const memberId of group.memberIds) {
      const member = await User.findById(memberId);
      if (member) {
        validMembers.push(memberId);
      }
    }
    
    // If some members were removed, update the group
    if (validMembers.length !== group.memberIds.length) {
      console.log(`Group ${group.name} had orphaned members. Cleaning up: ${group.memberIds.length} -> ${validMembers.length}`);
      group.memberIds = validMembers;
      group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
      group.group_status = group.target_status === 'full' ? 'paused' : 'active';
      await group.save();
    }
    
    if (!group.canSendLikes()) {
      return res.status(400).json({ 
        error: 'Sorry, your group is full. You cannot send anymore likes!' 
      });
    }

    // Check if target user exists and is active and individual
    const targetUser = await User.findById(targetUserId);
    if (!targetUser || !targetUser.isActive || targetUser.status !== 'individual') {
      return res.status(404).json({ error: 'Target user not found, inactive, or already in a group' });
    }

    // Check if group already swiped on this user
    let existingSwipe = await SwipeAction.findOne({ 
      groupId, 
      targetUserId,
      swipeType: 'group_to_user'
    });
    
    if (existingSwipe) {
      if (existingSwipe.action === action) {
        // If it's the same action, just return success (no need to duplicate)
        console.log(`Group ${groupId} already ${action}d user ${targetUserId}, returning existing result`);
        
        if (action === 'like' || action === 'superlike') {
          let groupMatch = await GroupMatch.findOne({ groupId, userId: targetUserId });
          return res.json({ 
            success: true, 
            groupMatch: true, 
            groupMatchId: groupMatch?._id 
          });
        }
        return res.json({ success: true, groupMatch: false });
      }
      // Update existing swipe to new action
      existingSwipe.action = action;
      await existingSwipe.save();
    } else {
      // Create new group swipe
      const swipeAction = new SwipeAction({
        groupId,
        targetUserId,
        action,
        swipeType: 'group_to_user'
      });
      await swipeAction.save();
      existingSwipe = swipeAction;
    }
    
    // If it's a like, create a GroupMatch
    if (action === 'like' || action === 'superlike') {
      // Check if GroupMatch already exists
      let groupMatch = await GroupMatch.findOne({ groupId, userId: targetUserId });
      
      if (!groupMatch) {
        groupMatch = new GroupMatch({
          groupId,
          userId: targetUserId,
          initiatedBy: 'group',
          groupMemberInitiator: userId,
          status: 'pending'
        });
        await groupMatch.save();
        
        // Notify target user via socket
        io.to(targetUserId).emit('groupMatch', groupMatch);
      }
      
      console.log(`🎯 Group swipe successful: Group ${groupId} liked user ${targetUserId}`);
      return res.json({ 
        success: true, 
        groupMatch: true, 
        groupMatchId: groupMatch._id 
      });
    }
    
    console.log(`✅ Group swipe recorded: Group ${groupId} ${action} user ${targetUserId}`);
    res.json({ success: true, groupMatch: false });
  } catch (error) {
    console.error('Group swipe error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// 6. MATCHES
// ---------------------------------------------------------------------------

/**
 * GET /api/users/:id/matches
 *
 * Return everything that belongs on the user's Matches screen. Four different
 * kinds of record are normalised into one array:
 *
 *   1. Real matches      - `Match` documents, returned as-is with both users populated.
 *   2. Pending matches   - inbound likes not yet reciprocated, synthesised from
 *                          `SwipeAction` records with an id of `pending_<swipeId>`.
 *                          Likes from users who have since joined a group are
 *                          filtered out, as are likes that already became a match.
 *   3. Group matches     - pending `GroupMatch` invitations, id `group_match_<id>`,
 *                          carrying the group and its populated members.
 *   4. Available groups  - active groups the user could ask to join, id
 *                          `group_<id>`. Groups the user already has a pending
 *                          join request with are excluded so they are not offered twice.
 *
 * The id prefixes are the contract with the client: MatchesList.tsx dispatches
 * on them to decide which card and which accept/decline endpoint applies.
 *
 * Loading the candidate groups is wrapped separately so that a failure there
 * still returns the real matches.
 *
 * @returns 200 with the combined array; 403 for another user's matches.
 */
app.get('/api/users/:id/matches', authMiddleware, async (req, res) => {
  try {
    console.log('Loading matches for user:', req.params.id, 'requested by:', req.userId);
    
    if (req.userId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('Finding matches in database...');
    
    // Get actual matches (mutual likes)
    const userMatches = await Match.find({
      $or: [
        { userId1: req.params.id },
        { userId2: req.params.id }
      ]
    }).populate('userId1 userId2', '-password');
    
    console.log('Found', userMatches.length, 'actual matches');
    
    // Get incoming likes (people who swiped right on this user but haven't been matched yet)
    console.log('Finding incoming likes...');
    const incomingLikes = await SwipeAction.find({
      targetUserId: req.params.id,
      action: { $in: ['like', 'superlike'] }
    }).populate('userId', '-password');
    
    console.log('Found', incomingLikes.length, 'incoming likes');
    console.log('🔍 DEBUG: Raw incoming likes:');
    incomingLikes.forEach((like, index) => {
      console.log(`  ${index + 1}. SwipeAction ${like._id}:`);
      console.log(`     - Swiper: ${like.userId?.name} (${like.userId?._id}) - Status: ${like.userId?.status}`);
      console.log(`     - Target: ${req.params.id}`);
      console.log(`     - Action: ${like.action}`);
      console.log(`     - Created: ${like.createdAt}`);
      console.log(`     - Swiper in group: ${like.userId?.groupId ? 'YES' : 'NO'}`);
    });
    
    // Create pending match objects for incoming likes that aren't already matches
    console.log('Processing pending matches...');
    const pendingMatches = incomingLikes
      .filter(like => {
        if (!like.userId) {
          console.log('Warning: SwipeAction has no populated userId:', like._id);
          return false;
        }
        // Check if there's already a match between these two users
        const hasMatch = userMatches.some(match => {
          const user1Id = match.userId1?._id?.toString();
          const user2Id = match.userId2?._id?.toString();
          const likerUserId = like.userId._id.toString();
          const currentUserId = req.params.id;
          
          // Check both directions for the match
          return (user1Id === likerUserId && user2Id === currentUserId) ||
                 (user1Id === currentUserId && user2Id === likerUserId);
        });
        
        // Check if the swiper is in a group (should be filtered out)
        const swiperInGroup = like.userId.status === 'in_group' && like.userId.groupId;
        
        if (hasMatch) {
          console.log(`✅ Filtering out pending match - already matched: ${like.userId._id} <-> ${req.params.id}`);
          return false;
        } else if (swiperInGroup) {
          console.log(`🚫 Filtering out pending match - swiper in group: ${like.userId?.name} (${like.userId._id}) -> ${req.params.id}`);
          return false;
        } else {
          console.log(`✅ Keeping pending match: ${like.userId?.name || like.userId._id} -> ${req.params.id} (valid individual like)`);
          return true;
        }
      })
      .map(like => ({
        id: `pending_${like._id}`,
        userId1: like.userId._id.toString(),
        userId2: req.params.id,
        status: 'pending',
        createdAt: like.createdAt,
        updatedAt: like.updatedAt,
        // Include the user data for the person who liked you
        likedBy: like.userId
      }));
    
    console.log('Created', pendingMatches.length, 'pending matches');
    console.log('🔍 DEBUG: Final pending matches:');
    pendingMatches.forEach((match, index) => {
      console.log(`  ${index + 1}. ${match.id}: ${match.likedBy?.name} (${match.userId1}) -> ${match.userId2}`);
    });
    
    // Get group matches (groups that liked this user)
    console.log('Loading group matches...');
    const groupMatches = await GroupMatch.find({
      userId: req.params.id,
      status: 'pending'
    }).populate({
      path: 'groupId',
      select: '-pendingVotes',
      populate: {
        path: 'memberIds',
        select: 'name age gender photos email'
      }
    }).catch(err => {
      console.error('Error loading group matches:', err);
      return []; // Return empty array on error
    });
    
    console.log('Found', groupMatches.length, 'group matches');
    
    // Create pending match objects for group matches
    console.log('Processing group matches...');
    const pendingGroupMatches = groupMatches
      .filter(groupMatch => {
        if (!groupMatch.groupId) {
          console.log('Filtering out group match with missing groupId:', groupMatch._id);
          return false;
        }
        return true;
      })
      .map(groupMatch => {
        try {
          return {
            id: `group_match_${groupMatch._id}`,
            groupId: groupMatch.groupId._id.toString(),
            userId: req.params.id,
            status: 'pending',
            type: 'group_match',
            createdAt: groupMatch.createdAt,
            updatedAt: groupMatch.updatedAt,
            // Include group data for display with populated member details
            group: {
              _id: groupMatch.groupId._id,
              name: groupMatch.groupId.name,
              description: groupMatch.groupId.description,
              memberIds: groupMatch.groupId.memberIds,
              members: groupMatch.groupId.memberIds || [], // Populated member objects
              photos: groupMatch.groupId.photos,
              preferences: groupMatch.groupId.preferences,
              memberCount: groupMatch.groupId.memberIds ? groupMatch.groupId.memberIds.length : 0,
              maxMembers: groupMatch.groupId.maxMembers
            }
          };
        } catch (err) {
          console.error('Error processing group match:', groupMatch._id, err);
          return null;
        }
      })
      .filter(match => match !== null);
    
    // Combine real matches, pending matches, and group matches
    const allMatches = [...userMatches, ...pendingMatches, ...pendingGroupMatches];
    
    console.log('Returning matches for user:', req.params.id);
    console.log('Real matches:', userMatches.length);
    console.log('Pending matches:', pendingMatches.length);
    
    // ----- NEW: include active candidate group profiles so users can see groups on their feed -----
    try {
      // First, get all pending join requests from this user to exclude those groups
      const pendingRequests = await GroupJoinRequest.find({
        requester: req.params.id,
        status: 'pending'
      }).select('groupId');
      
      const excludedGroupIds = pendingRequests.map(req => req.groupId);
      console.log(`Found ${excludedGroupIds.length} groups with pending join requests from user ${req.params.id}`);

      const candidateGroups = await Group.find({
        isActive: true,
        group_status: 'active', // Only show active groups (not paused when full)
        memberIds: { $nin: [req.params.id] },
        _id: { $nin: excludedGroupIds } // Exclude groups with pending join requests
      }).limit(50).lean();

      const groupMatches = (candidateGroups || []).map(g => {
        const memberCount = Array.isArray(g.memberIds) ? g.memberIds.length : 0;
        const maxMembers = g.maxMembers || 4;
        return {
          id: `group_${g._id}`,
          type: 'group',
          groupId: g._id,
          name: g.name,
          description: g.description,
          members: (g.memberIds || []).slice(0, 4),
          photos: g.photos || [],
          preferences: g.preferences || {},
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          status: 'group_available',
          isFull: memberCount >= maxMembers,
          memberCount,
          maxMembers
        };
      });

      allMatches.push(...groupMatches);
      console.log(`Added ${groupMatches.length} group(s) to matches for user ${req.params.id}`);
    } catch (err) {
      console.error('Error loading candidate groups for matches:', err);
    }
    // --------------------------------------------------------------------------

    console.log('🔍 DEBUG: Final response breakdown:');
    console.log(`  - User matches (accepted): ${userMatches.length}`);
    console.log(`  - Pending matches (individual likes): ${pendingMatches.length}`);
    console.log(`  - Group matches: ${pendingGroupMatches.length}`);
    console.log(`  - Available groups: ${allMatches.filter(m => m.type === 'group').length}`);
    console.log(`  - Total matches returned: ${allMatches.length}`);
    
    res.json(allMatches);
  } catch (error) {
    console.error('Get matches error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// 7. GROUPS
// ---------------------------------------------------------------------------

/**
 * POST /api/groups
 *
 * Create a group directly from an explicit member list. The caller must include
 * themselves, and every listed member must exist and be active.
 *
 * After the group is saved, any existing pairwise matches between its members
 * are rewritten to status 'group' and pointed at the new group, so those
 * conversations move from the individual matches list into the group. All
 * members are then flipped to 'in_group' with their individual profile paused;
 * `isActive` stays true because that flag also gates the ability to log in.
 *
 * @returns 200 with the created group; 400 when the member list is invalid.
 */
app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { name, description, memberIds, preferences, photos } = req.body;
    
    // Validate that current user is in memberIds
    if (!memberIds.includes(req.userId)) {
      return res.status(400).json({ error: 'You must be a member of the group you create' });
    }

    // Check that all members exist and are active
    const members = await User.find({ _id: { $in: memberIds }, isActive: true });
    if (members.length !== memberIds.length) {
      return res.status(400).json({ error: 'One or more members not found or inactive' });
    }
    
    const group = new Group({
      name,
      description,
      memberIds,
      preferences,
      photos: photos || []
    });
    
    await group.save();

    // ----- NEW: mark existing matches between group members as group matches -----
    try {
      const memberIdsArray = (group.memberIds || []).map(id => id.toString());
      for (let i = 0; i < memberIdsArray.length; i++) {
        for (let j = i + 1; j < memberIdsArray.length; j++) {
          const a = memberIdsArray[i];
          const b = memberIdsArray[j];
          await Match.updateOne(
            { $or: [{ userId1: a, userId2: b }, { userId1: b, userId2: a }] },
            { $set: { status: 'group', groupId: group._id } }
          );
        }
      }
      console.log('Updated matches to reference new group for members:', memberIdsArray);
    } catch (err) {
      console.error('Failed updating matches for new group (create-group):', err);
    }
    // --------------------------------------------------------------------------

    // Update member users
    await User.updateMany(
      { _id: { $in: memberIds } },
      { 
        groupId: group._id,
        status: 'in_group',
        profileStatus: 'paused',
        isActive: true // Users in groups should still be able to login
      }
    );

    res.json(group);
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/users/:id/group
 * Return the caller's own group with members populated.
 * @returns 200 with the group; 403 for another user; 404 when not in a group.
 */
app.get('/api/users/:id/group', authMiddleware, async (req, res) => {
  try {
    if (req.userId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const user = await User.findById(req.params.id);
    if (!user || !user.groupId) {
      return res.status(404).json({ error: 'User not in a group' });
    }
    
    const group = await Group.findById(user.groupId).populate('memberIds', '-password');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    res.json(group);
  } catch (error) {
    console.error('Get user group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/groups/:groupId/propose
 *
 * Open a vote on admitting a new member. Only an existing member may propose,
 * the group must have room, and the candidate must not already be a member or
 * the subject of an open proposal.
 *
 * The proposer's own 'yes' is recorded as the first ballot, so proposing is
 * itself an act of voting. Note this endpoint does not evaluate the threshold -
 * only /vote does - so a proposal never completes without at least one
 * subsequent call to /vote, even when the proposer's ballot alone would suffice.
 *
 * NOTE: not reachable from the user interface; see the /vote endpoint below.
 *
 * @returns 200 on success; 400 when full or already proposed; 403 for non-members.
 */
app.post('/api/groups/:groupId/propose', authMiddleware, async (req, res) => {
  try {
    const { proposedUserId } = req.body;
    const groupId = req.params.groupId;
    const proposerId = req.userId;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.memberIds.includes(proposerId)) {
      return res.status(403).json({ error: 'Only group members can propose new members' });
    }

    // Check if group is at capacity
    if (!group.canAddMember()) {
      return res.status(400).json({ error: 'Group is at maximum capacity' });
    }

    // Check if user is already a member or already proposed
    if (group.memberIds.includes(proposedUserId)) {
      return res.status(400).json({ error: 'User is already a group member' });
    }

    if (group.pendingVotes.has(proposedUserId)) {
      return res.status(400).json({ error: 'User already has a pending proposal' });
    }
    
    // Add proposer's vote
    group.pendingVotes.set(proposedUserId, [{
      voterId: proposerId,
      vote: 'yes',
      createdAt: new Date()
    }]);
    
    await group.save();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Propose member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/groups/:groupId/vote
 *
 * Cast or change a ballot on an open membership proposal. A member who has
 * already voted has their previous ballot replaced rather than duplicated.
 *
 * The threshold is `ceil(memberCount / 2)` 'yes' ballots, evaluated after every
 * ballot - so admission happens as soon as it is reached rather than waiting for
 * everyone to vote. On success the candidate is added, moved to 'in_group', the
 * proposal is cleared, and all members are notified over Socket.io.
 *
 * KNOWN ISSUES with the threshold:
 *   - In a two-member group the threshold is 1, already satisfied by the
 *     proposer's automatic 'yes' recorded at proposal time. The other member
 *     voting 'no' therefore still admits the candidate: the ballot is counted,
 *     the check re-runs, and 1 >= 1 passes. A rejection acts as an approval.
 *   - For even member counts the threshold is exactly half rather than a
 *     majority - 2 of 4, 3 of 6, 4 of 8 all pass.
 *   - 'no' ballots are recorded but never actually consulted; only the 'yes'
 *     count is compared against the threshold, so a proposal can never be
 *     defeated, only left pending.
 *
 * NOTE: this endpoint and /propose are not reachable from the user interface -
 * no client component calls either. Members join in practice through the group
 * invite and join-request flows. See the README's Known Limitations.
 *
 * @body   {string} proposedUserId, {'yes'|'no'} vote
 * @returns 200 on success; 403 for non-members; 404 with no open proposal.
 */
app.post('/api/groups/:groupId/vote', authMiddleware, async (req, res) => {
  try {
    const { proposedUserId, vote } = req.body;
    const groupId = req.params.groupId;
    const voterId = req.userId;
    
    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Vote must be yes or no' });
    }
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.memberIds.includes(voterId)) {
      return res.status(403).json({ error: 'Only group members can vote' });
    }
    
    if (!group.pendingVotes.has(proposedUserId)) {
      return res.status(404).json({ error: 'No pending proposal for this user' });
    }
    
    const votes = group.pendingVotes.get(proposedUserId);
    const existingVoteIndex = votes.findIndex(v => v.voterId.equals(voterId));
    
    if (existingVoteIndex >= 0) {
      votes[existingVoteIndex].vote = vote;
    } else {
      votes.push({
        voterId,
        vote,
        createdAt: new Date()
      });
    }
    
    group.pendingVotes.set(proposedUserId, votes);
    
    // Check if member is accepted
    const yesVotes = votes.filter(v => v.vote === 'yes').length;
    const totalMembers = group.memberIds.length;
    const requiredVotes = Math.ceil(totalMembers / 2);
    
    if (yesVotes >= requiredVotes) {
      // Add member to group
      const success = group.addMember(proposedUserId);
      if (success) {
        await User.findByIdAndUpdate(proposedUserId, {
          groupId: group._id,
          status: 'in_group',
          profileStatus: 'paused',
          isActive: true // Users in groups should still be able to login
        });
        
        // Clear pending votes
        group.pendingVotes.delete(proposedUserId);
        
        await group.save();
        
        // Notify group members
        group.memberIds.forEach(memberId => {
          io.to(memberId.toString()).emit('memberAdded', { 
            groupId: group._id, 
            newMemberId: proposedUserId 
          });
        });
      }
    } else {
      await group.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Vote on member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/group-requests
 *
 * Ask another individual user to form a new group together. Both parties must
 * currently be individuals, and only one pending request may exist between a
 * given pair in either direction. The recipient is notified in real time.
 *
 * @returns 201 with the populated request; 400 when either user is already in a
 *          group or a request is already outstanding.
 */
app.post('/api/group-requests', authMiddleware, async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const requesterId = req.userId;

    // Validate input
    if (!recipientId) {
      return res.status(400).json({ error: 'Recipient ID is required' });
    }

    if (recipientId === requesterId) {
      return res.status(400).json({ error: 'Cannot send group request to yourself' });
    }

    // Check if users exist and are individual
    const [requester, recipient] = await Promise.all([
      User.findById(requesterId),
      User.findById(recipientId)
    ]);

    if (!requester || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (requester.status !== 'individual' || recipient.status !== 'individual') {
      return res.status(400).json({ error: 'Both users must be individual to form a group' });
    }

    // Check for existing request
    const existingRequest = await GroupRequest.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId, status: 'pending' },
        { requester: recipientId, recipient: requesterId, status: 'pending' }
      ]
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Group request already exists between these users' });
    }

    // Create group request
    const groupRequest = new GroupRequest({
      requester: requesterId,
      recipient: recipientId,
      message: message || '',
      status: 'pending'
    });

    await groupRequest.save();

    // Populate the request for response
    await groupRequest.populate('requester', 'name photos');
    await groupRequest.populate('recipient', 'name photos');

    // Emit real-time notification to recipient
    io.to(recipientId).emit('groupRequestReceived', {
      requestId: groupRequest._id,
      requester: groupRequest.requester,
      message: groupRequest.message
    });

    res.status(201).json({
      success: true,
      message: 'Group request sent successfully',
      request: groupRequest
    });
  } catch (error) {
    console.error('Send group request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/group-requests
 * List the caller's group requests, split into `sent` and `received`, newest first.
 */
app.get('/api/group-requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const [sentRequests, receivedRequests] = await Promise.all([
      GroupRequest.find({ requester: userId })
        .populate('recipient', 'name photos')
        .sort({ requestedAt: -1 }),
      GroupRequest.find({ recipient: userId })
        .populate('requester', 'name photos')
        .sort({ requestedAt: -1 })
    ]);

    res.json({
      success: true,
      sent: sentRequests,
      received: receivedRequests
    });
  } catch (error) {
    console.error('Get group requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/group-requests/conversation/:userId
 * Return every group request exchanged with one specific user, in either
 * direction. Lets the messaging UI render the request inline in the thread.
 */
app.get('/api/group-requests/conversation/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.userId;
    const otherUserId = req.params.userId;

    const requests = await GroupRequest.find({
      $or: [
        { requester: currentUserId, recipient: otherUserId },
        { requester: otherUserId, recipient: currentUserId }
      ]
    })
    .populate('requester', 'name photos')
    .populate('recipient', 'name photos')
    .sort({ requestedAt: -1 });

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Get conversation group requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/group-requests/:requestId/respond
 *
 * Accept or reject an invitation to form a group. Only the recipient may
 * respond, and only while the request is still pending.
 *
 * On acceptance this is where a `Group` is actually created. The two users'
 * preference sets are merged conservatively, so the group profile satisfies both
 * members rather than either one alone:
 *   - age range     - intersected (highest minimum, lowest maximum)
 *   - gender list   - intersected
 *   - max rent      - the lower of the two budgets
 *   - cleanliness / noise - averaged and rounded
 *   - pets, smoking - logical AND, so a 'no' from either wins
 *   - location      - taken from the requester, with fallbacks
 *
 * The new group inherits both members' photos (http URLs only, since group
 * photo validation rejects other forms), existing matches between the members
 * are re-pointed at the group, and both users move to 'in_group' with paused
 * individual profiles.
 *
 * @body   {'accept'|'reject'} action
 * @returns 200 with the group and updated request; 403 when not the recipient.
 */
app.post('/api/group-requests/:requestId/respond', authMiddleware, async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const requestId = req.params.requestId;
    const userId = req.userId;

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accept or reject' });
    }

    // Find and validate request
    const groupRequest = await GroupRequest.findById(requestId)
      .populate('requester')
      .populate('recipient');

    if (!groupRequest) {
      return res.status(404).json({ error: 'Group request not found' });
    }

    if (groupRequest.recipient._id.toString() !== userId) {
      return res.status(403).json({ error: 'You can only respond to requests sent to you' });
    }

    if (groupRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been responded to' });
    }

    // Update request status
    groupRequest.status = action === 'accept' ? 'accepted' : 'rejected';
    groupRequest.respondedAt = new Date();
    await groupRequest.save();

    if (action === 'accept') {
      // Create group
      console.log('Creating group for:', groupRequest.requester.name, 'and', groupRequest.recipient.name);
      const groupName = `${groupRequest.requester.name} & ${groupRequest.recipient.name}`;
      
      // Merge the two members' preferences into a single group profile, taking
      // the more restrictive value on every axis - see the endpoint header for
      // the rule applied to each field.
      const req1Prefs = groupRequest.requester.preferences;
      const req2Prefs = groupRequest.recipient.preferences;
      
      const groupPreferences = {
        minAge: Math.max(req1Prefs.minAge, req2Prefs.minAge),
        maxAge: Math.min(req1Prefs.maxAge, req2Prefs.maxAge),
        preferredGender: req1Prefs.preferredGender.filter(g => req2Prefs.preferredGender.includes(g)),
        maxRent: Math.min(req1Prefs.maxRent, req2Prefs.maxRent),
        cleanlinessLevel: Math.round((req1Prefs.cleanlinessLevel + req2Prefs.cleanlinessLevel) / 2),
        noiseTolerance: Math.round((req1Prefs.noiseTolerance + req2Prefs.noiseTolerance) / 2),
        petFriendly: req1Prefs.petFriendly && req2Prefs.petFriendly,
        smokingAllowed: req1Prefs.smokingAllowed && req2Prefs.smokingAllowed,
        location: {
          city: req1Prefs.location?.city || 'Unknown',
          state: req1Prefs.location?.state || 'Unknown',
          zipCode: req1Prefs.location?.zipCode || '',
          coordinates: req1Prefs.location?.coordinates || { lat: 0, lng: 0 }
        }
      };

      const group = new Group({
        name: groupName,
        description: `Group formed by ${groupRequest.requester.name} and ${groupRequest.recipient.name}`,
        memberIds: [groupRequest.requester._id, groupRequest.recipient._id],
        preferences: groupPreferences,
        photos: [...(groupRequest.requester.photos || []), ...(groupRequest.recipient.photos || [])]
          .filter(photo => photo && photo.startsWith('http')), // Only include valid URLs
        isActive: true
      });

      console.log('Saving group with data:', {
        name: group.name,
        memberIds: group.memberIds,
        preferences: group.preferences,
        photos: group.photos
      });
      
      await group.save();
      console.log('Group saved successfully with ID:', group._id);
     // ----- NEW: mark existing matches between group members as group matches -----
      try {
        const Match = require('./models/Match');
        const memberIdsArray = (group.memberIds || []).map(id => id.toString());
        for (let i = 0; i < memberIdsArray.length; i++) {
          for (let j = i + 1; j < memberIdsArray.length; j++) {
            const a = memberIdsArray[i];
            const b = memberIdsArray[j];
            await Match.updateOne(
              { $or: [{ userId1: a, userId2: b }, { userId1: b, userId2: a }] },
              { $set: { status: 'group', groupId: group._id } }
            );
          }
        }
        console.log('Updated matches to reference new group for members:', memberIdsArray);
      } catch (err) {
        console.error('Failed updating matches for new group:', err);
      }
      // --------------------------------------------------------------------------
      // Update both users' status and groupId
      console.log('Updating users to in_group status:', {
        requester: groupRequest.requester._id,
        recipient: groupRequest.recipient._id,
        groupId: group._id
      });
      
      await Promise.all([
        User.findByIdAndUpdate(groupRequest.requester._id, {
          status: 'in_group',
          groupId: group._id,
          profileStatus: 'paused', // Pause profile but allow login
          isActive: true // KEEP ACTIVE - users in groups should still be able to login
        }),
        User.findByIdAndUpdate(groupRequest.recipient._id, {
          status: 'in_group',
          groupId: group._id,
          profileStatus: 'paused', // Pause profile but allow login
          isActive: true // KEEP ACTIVE - users in groups should still be able to login
        })
      ]);
      
      console.log('Users updated successfully to in_group status');

      // Update request with group ID
      groupRequest.groupId = group._id;
      await groupRequest.save();

      // Emit real-time notifications
      [groupRequest.requester._id, groupRequest.recipient._id].forEach(memberId => {
        io.to(memberId.toString()).emit('groupFormed', {
          groupId: group._id,
          groupName: group.name,
          members: group.memberIds
        });
      });

      res.json({
        success: true,
        message: 'Group request accepted and group created',
        group: group,
        request: groupRequest
      });
    } else {
      // Notify requester of rejection
      io.to(groupRequest.requester._id.toString()).emit('groupRequestRejected', {
        requestId: groupRequest._id,
        rejectedBy: groupRequest.recipient.name
      });

      res.json({
        success: true,
        message: 'Group request rejected',
        request: groupRequest
      });
    }
  } catch (error) {
    console.error('Respond to group request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/groups/:groupId
 * Full group record, restricted to its own members.
 * @returns 200 with the group; 403 for non-members; 404 if unknown.
 */
app.get('/api/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;

    const group = await Group.findById(groupId).populate('memberIds', 'name photos email');
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is a member of this group
    if (!group.memberIds.some(member => member._id.toString() === userId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    res.json(group);
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/groups/:groupId/preview
 *
 * Group record for any authenticated user, used to render group cards in the
 * discovery feed. Unlike the endpoint above there is no membership check, since
 * the whole point is to show the group to outsiders considering joining.
 */
app.get('/api/groups/:groupId/preview', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;

    const group = await Group.findById(groupId).populate('memberIds', 'name photos email age gender preferences');
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Return group data without member restrictions
    res.json(group);
  } catch (error) {
    console.error('Get group preview error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/groups/:groupId
 *
 * Edit a group's name, description, preferences, photos or capacity. Any member
 * may edit; there is no owner role.
 *
 * `maxMembers` is clamped to the 2-8 range the UI offers and, because lowering
 * it can make an existing group full, the derived status flags are recomputed
 * immediately. All members receive a `groupUpdated` event so open clients
 * refresh.
 *
 * @returns 200 with the populated group; 403 for non-members.
 */
app.put('/api/groups/:groupId', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;
    const { name, description, preferences } = req.body;

    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is a member of this group
    if (!group.memberIds.includes(userId)) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this group.' });
    }

    // Update group fields
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (preferences) group.preferences = { ...group.preferences, ...preferences };

    // Support updating photos array (client sends single photo as photos: [photo] or [])
    if (req.body.photos !== undefined) {
      if (Array.isArray(req.body.photos)) {
        group.photos = req.body.photos;
      } else if (typeof req.body.photos === 'string') {
        group.photos = [req.body.photos];
      }
    }

      if (req.body.maxMembers !== undefined) {
        const mm = parseInt(req.body.maxMembers, 10);
        if (!isNaN(mm)) {
          // Clamp to allowed UI limits (2..8)
          group.maxMembers = Math.max(2, Math.min(8, mm));
          
          // Update status based on new max members
          group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
          group.group_status = group.target_status === 'full' ? 'paused' : 'active';
        }
      }

    await group.save();

    // Return populated group
    await group.populate('memberIds', 'name photos email');
    
    // Notify all group members about the group update
    group.memberIds.forEach(memberId => {
      io.to(memberId._id.toString()).emit('groupUpdated', {
        groupId: group._id.toString(),
        action: 'group_edited'
      });
    });
    
    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/groups/:groupId/leave
 *
 * Remove the caller from a group and restore them as an individual.
 *
 * Sequence:
 *   1. Drop the user from `memberIds` and recompute the group's status flags.
 *   2. Reset the user to 'individual' with an active profile.
 *   3. Delete every `GroupMatch` addressed to this user in any status, plus this
 *      group's pending ones. This matters: an 'accepted' group match left behind
 *      by a partially-completed join would block the user from ever seeing a new
 *      invitation.
 *   4. Delete the swipes between this user and this group so the two can
 *      encounter each other again.
 *   5. Close out the `UserGroupHistory` record by stamping `leftAt`, but
 *      deliberately do NOT restore the archived swipes and matches - leaving
 *      them deleted is what allows the user to be rematched from scratch.
 *   6. If one member remains the group is dissolved: that member is also
 *      restored to individual status, the group's swipes and matches are
 *      cleared, and the group document is deleted. Otherwise the group survives
 *      and a system message announcing the departure is posted to its thread.
 *
 * @returns 200 with { groupDissolved }; 400 when the caller is not a member.
 */
app.post('/api/groups/:groupId/leave', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;

    // Find the group and user
    const [group, user] = await Promise.all([
      Group.findById(groupId),
      User.findById(userId)
    ]);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is in this group
    if (user.groupId?.toString() !== groupId || !group.memberIds.includes(userId)) {
      return res.status(400).json({ error: 'You are not a member of this group' });
    }

    // Remove user from group
    group.memberIds = group.memberIds.filter(memberId => memberId.toString() !== userId);
    
    // Update group status based on new member count
    group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
    group.group_status = group.target_status === 'full' ? 'paused' : 'active';

    // Update user status back to individual
    await User.findByIdAndUpdate(userId, {
      status: 'individual',
      groupId: null,
      profileStatus: 'active', // Restore active profile
      isActive: true // Keep for backward compatibility
    });
    
    // Clean up any group matches for this user (both sent and received, both pending and accepted)
    // This is important because if a user had an "accepted" GroupMatch but failed to fully join,
    // it would prevent them from seeing new invitations when they leave and get re-invited
    const deletedGroupMatches = await GroupMatch.deleteMany({
      $or: [
        { userId: userId },  // ALL Group invitations TO this user (any status)
        { groupId: groupId, status: 'pending' } // Pending invitations FROM this group
      ]
    });
    console.log(`Deleted ${deletedGroupMatches.deletedCount} group matches for user leaving group`);
    
    // Clean up ALL SwipeActions involving this user and group to allow re-swiping
    const deletedGroupSwipes = await SwipeAction.deleteMany({
      $or: [
        { groupId: groupId, targetUserId: userId, swipeType: 'group_to_user' }, // Group swiped on this user
        { userId: userId, targetGroupId: groupId, swipeType: 'user_to_group' }  // User swiped on this group
      ]
    });
    console.log(`Deleted ${deletedGroupSwipes.deletedCount} swipe actions between user ${userId} and group ${groupId}`);
    
    // Mark user's group history as processed but DO NOT restore old matches/swipes
    // This ensures they stay deleted and allows for potential rematching
    const groupHistory = await UserGroupHistory.findOne({
      userId: userId,
      groupId: groupId,
      leftAt: { $exists: false }
    });
    
    if (groupHistory) {
      // Mark history record as processed without restoring data
      groupHistory.leftAt = new Date();
      await groupHistory.save();
      
      console.log(`User ${userId} left group ${groupId}. Old matches and swipes remain deleted to allow rematching.`);
    }

    // If group becomes empty or has only 1 member, delete it
    if (group.memberIds.length <= 1) {
      // Update remaining member (if any) back to individual
      if (group.memberIds.length === 1) {
        const remainingMemberId = group.memberIds[0];
        
        await User.findByIdAndUpdate(remainingMemberId, {
          status: 'individual',
          groupId: null,
          profileStatus: 'active', // Restore active profile
          isActive: true // Keep for backward compatibility
        });
        
        // Mark remaining member's group history as processed but DO NOT restore matches
        const remainingMemberHistory = await UserGroupHistory.findOne({
          userId: remainingMemberId,
          groupId: groupId,
          leftAt: { $exists: false }
        });
        
        if (remainingMemberHistory) {
          remainingMemberHistory.leftAt = new Date();
          await remainingMemberHistory.save();
          console.log(`Group dissolved. User ${remainingMemberId} old matches remain deleted to allow rematching.`);
        }
        
        // Notify remaining member
        io.to(remainingMemberId.toString()).emit('groupDissolved', {
          message: 'Your group has been dissolved because the other member left.'
        });
      }
      
      // Clean up all pending group matches for this group before deleting it
      await GroupMatch.deleteMany({ groupId: groupId, status: 'pending' });
      
      // Clean up ALL SwipeActions involving this group to allow re-swiping
      const deletedGroupSwipes = await SwipeAction.deleteMany({
        $or: [
          { groupId: groupId, swipeType: 'group_to_user' }, // Group swiped on users
          { targetGroupId: groupId, swipeType: 'user_to_group' }  // Users swiped on this group
        ]
      });
      console.log(`Deleted ${deletedGroupSwipes.deletedCount} swipe actions for dissolved group ${groupId}`);
      
      // Delete the group
      await Group.findByIdAndDelete(groupId);
      
      res.json({
        success: true,
        message: 'Left group successfully. Group was dissolved.',
        groupDissolved: true
      });
    } else {
      // Save the updated group
      await group.save();
      
      // Add system message to group chat
      const systemMessage = new Message({
        senderId: null, // System message
        groupId: groupId,
        content: `${user.name} has left the group chat`,
        messageType: 'system'
      });
      await systemMessage.save();

      // Notify remaining group members with chat message
      group.memberIds.forEach(memberId => {
        io.to(memberId.toString()).emit('memberLeft', {
          groupId: group._id,
          leftUserId: userId,
          leftUserName: user.name
        });
        
        // Send the system message to group chat
        io.to(memberId.toString()).emit('message', systemMessage);
      });
      
      res.json({
        success: true,
        message: 'Left group successfully',
        groupDissolved: false
      });
    }

    // Notify the user who left
    io.to(userId).emit('leftGroup', {
      message: 'You have successfully left the group. Your individual profile is now active.'
    });

  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

  /**
   * POST /api/groups/:groupId/join-request
   *
   * Ask to join an existing group. Blocked for current members and when a
   * request from this user is already pending. The requester is populated before
   * the Socket.io broadcast so members receive a renderable name and photo
   * rather than a bare id.
   *
   * @returns 201 with the request; 400 if already a member or already pending.
   */
  app.post('/api/groups/:groupId/join-request', authMiddleware, async (req, res) => {
    try {
      const { message } = req.body;
      const groupId = req.params.groupId;
      const requesterId = req.userId;

      const group = await Group.findById(groupId);
      if (!group || !group.isActive) {
        return res.status(404).json({ error: 'Group not found or inactive' });
      }

      // Cannot join if already member
      if (group.memberIds.map(id => id.toString()).includes(requesterId)) {
        return res.status(400).json({ error: 'Already a member of the group' });
      }

      // Prevent duplicate pending requests
      const existing = await GroupJoinRequest.findOne({ groupId, requester: requesterId, status: 'pending' });
      if (existing) {
        return res.status(400).json({ error: 'Join request already pending' });
      }

      const joinRequest = new GroupJoinRequest({ groupId, requester: requesterId, message: message || '' });
      await joinRequest.save();

      // Populate requester info so clients receive meaningful data via socket
      await joinRequest.populate('requester', 'name photos email');

      // Notify group members (emit to each member) with populated requester info
      group.memberIds.forEach(memberId => {
        io.to(memberId.toString()).emit('groupJoinRequest', {
          requestId: joinRequest._id,
          groupId: group._id,
          requester: joinRequest.requester, // populated object
          message: joinRequest.message,
          createdAt: joinRequest.createdAt
        });
      });

      res.status(201).json({ success: true, request: joinRequest });
    } catch (err) {
      console.error('Send join request error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  /**
   * POST /api/groups/:groupId/join-request/:requestId/respond
   *
   * Accept or reject an inbound join request. Any current member may respond,
   * and only a pending request may be answered.
   *
   * Acceptance is the most involved write path in the file, because admitting a
   * user has to unwind their entire individual matching state:
   *   1. Add them to the group and flip them to 'in_group' / paused.
   *   2. Mark the request accepted.
   *   3. Delete their individual swipes in both directions, and every pending
   *      match they were part of. Everyone affected receives a
   *      `matchInvalidated` event so stale cards disappear from open clients.
   *   4. Re-point existing matches between all members at the group.
   *
   * Step 3 is wrapped in its own try/catch and never rethrows: cleanup failing
   * must not roll back a join that has already succeeded.
   *
   * @body   {'accept'|'reject'} action
   * @returns 200 with { accepted }; 403 for non-members; 400 if already handled.
   */
  app.post('/api/groups/:groupId/join-request/:requestId/respond', authMiddleware, async (req, res) => {
    try {
    console.log('Join-request respond incoming payload:', { params: req.params, body: req.body, userId: req.userId });
    const { action } = req.body; // 'accept' or 'reject'
    const { groupId, requestId } = req.params;
      const userId = req.userId;

      console.log('Respond to join-request called:', { userId, groupId, requestId, action });

      if (!['accept', 'reject'].includes(action)) {
        console.warn('Invalid action provided for join-request respond:', action);
        return res.status(400).json({ error: 'Invalid action' });
      }

      const group = await Group.findById(groupId);
      if (!group) {
        console.warn('Group not found for join-request respond:', groupId);
        return res.status(404).json({ error: 'Group not found' });
      }

      console.log('Group memberIds:', group.memberIds.map(id => id.toString()));

      // Only existing group members can respond
      if (!group.memberIds.map(id => id.toString()).includes(userId)) {
        console.warn('User is not a member and attempted to respond to join request', { userId, groupId });
        return res.status(403).json({ error: 'Only group members can respond to join requests' });
      }

      const joinRequest = await GroupJoinRequest.findById(requestId);
      if (!joinRequest) {
        console.warn('Join request not found:', requestId);
        return res.status(404).json({ error: 'Request not found' });
      }

      console.log('Join request current status:', joinRequest.status, 'requester:', joinRequest.requester.toString());

      if (joinRequest.status !== 'pending') {
        console.warn('Join request already handled:', requestId, 'status:', joinRequest.status);
        return res.status(400).json({ error: 'Request already handled' });
      }

      if (action === 'accept') {
        console.log('Accepting join request:', requestId, 'for group:', groupId, 'requester:', joinRequest.requester.toString());
        // Add to group
        try {
          group.memberIds.push(joinRequest.requester);
          console.log('Group memberIds before save count:', group.memberIds.length);
          await group.save();
          console.log('Group saved successfully after adding member');
        } catch (err) {
          console.error('Error saving group when accepting join request:', err);
          throw err;
        }

        // Update user
        try {
          await User.findByIdAndUpdate(joinRequest.requester, {
            groupId: group._id,
            status: 'in_group',
            profileStatus: 'paused',
            isActive: true
          });
          console.log('User updated successfully for new group member:', joinRequest.requester.toString());
        } catch (err) {
          console.error('Error updating user when accepting join request:', err);
          throw err;
        }

        // Mark joinRequest accepted
        try {
          joinRequest.status = 'accepted';
          await joinRequest.save();
          console.log('JoinRequest marked accepted and saved:', joinRequest._id.toString());
        } catch (err) {
          console.error('Error saving joinRequest after accept:', err);
          throw err;
        }

        // Clean up new member's pending individual likes and matches since they're joining a group
        try {
          console.log('Cleaning up pending likes and matches for new group member:', joinRequest.requester.toString());
          
          // Delete pending swipe actions involving this user (both as swiper and as target)
          const deletedSwipesAsSwiper = await SwipeAction.deleteMany({ 
            userId: joinRequest.requester,
            swipeType: { $in: ['user_to_user', undefined] } // Individual swipes only
          });
          console.log(`Deleted ${deletedSwipesAsSwiper.deletedCount} pending swipe actions where user was the swiper`);
          
          // Get swipes where this user was the target before deleting (to notify the swipers)
          const swipesTargetingUser = await SwipeAction.find({ 
            targetUserId: joinRequest.requester,
            swipeType: { $in: ['user_to_user', undefined] } // Individual swipes only
          });
          
          // Also delete swipes where this user was the target (these create pending matches for this user)
          const deletedSwipesAsTarget = await SwipeAction.deleteMany({ 
            targetUserId: joinRequest.requester,
            swipeType: { $in: ['user_to_user', undefined] } // Individual swipes only
          });
          console.log(`Deleted ${deletedSwipesAsTarget.deletedCount} pending swipe actions where user was the target`);
          
          // Notify users who had swiped on this user that their pending match is now invalid
          swipesTargetingUser.forEach(swipe => {
            const swiperId = swipe.userId.toString();
            const pendingMatchId = `pending_${swipe._id}`;
            io.to(swiperId).emit('matchInvalidated', { 
              matchId: pendingMatchId,
              reason: 'User joined a group' 
            });
            console.log(`Notified user ${swiperId} that pending match ${pendingMatchId} was invalidated`);
          });
          
          // Get pending matches before deleting to notify other users
          const pendingMatches = await Match.find({
            $or: [
              { userId1: joinRequest.requester, status: 'pending' },
              { userId2: joinRequest.requester, status: 'pending' }
            ]
          });
          
          // Delete pending matches where this user was involved
          const deletedMatches = await Match.deleteMany({
            $or: [
              { userId1: joinRequest.requester, status: 'pending' },
              { userId2: joinRequest.requester, status: 'pending' }
            ]
          });
          console.log(`Deleted ${deletedMatches.deletedCount} pending matches for user joining group`);
          
          // Notify other users that their pending matches with this user are now invalid
          pendingMatches.forEach(match => {
            const otherUserId = match.userId1.toString() === joinRequest.requester.toString() 
              ? match.userId2.toString() 
              : match.userId1.toString();
            io.to(otherUserId).emit('matchInvalidated', { 
              matchId: match._id.toString(),
              reason: 'User joined a group' 
            });
          });
          
        } catch (err) {
          console.error('Error cleaning up pending likes/matches when user joined group:', err);
          // Don't throw - this is cleanup, shouldn't block group joining
        }

        // Update existing matches between group members and the new member
        try {
          const memberIdsArray = (group.memberIds || []).map(id => id.toString());
          for (let i = 0; i < memberIdsArray.length; i++) {
            for (let j = i + 1; j < memberIdsArray.length; j++) {
              const a = memberIdsArray[i];
              const b = memberIdsArray[j];
              await Match.updateOne(
                { $or: [{ userId1: a, userId2: b }, { userId1: b, userId2: a }] },
                { $set: { status: 'group', groupId: group._id } }
              );
            }
          }
        } catch (err) {
          console.error('Failed updating matches for join-accept:', err);
        }

        // Notify requester
        io.to(joinRequest.requester.toString()).emit('joinRequestAccepted', { groupId: group._id, groupName: group.name });
        res.json({ success: true, accepted: true, group });
      } else {
        joinRequest.status = 'rejected';
        await joinRequest.save();
        io.to(joinRequest.requester.toString()).emit('joinRequestRejected', { groupId: group._id });
        res.json({ success: true, accepted: false });
      }
    } catch (err) {
      console.error('Respond to join request error:', err);
      // Return the error message in response to help debugging in dev
      const message = (err && err.message) ? err.message : 'Server error';
      // Also log stack if available
      if (err && err.stack) console.error(err.stack);
      res.status(500).json({ error: 'Server error', details: message });
    }
  });

/**
 * POST /api/groups/:groupId/invite
 *
 * Invite a specific user into an existing group. Functionally this is the group
 * liking that user: it performs the same validation as the group swipe endpoint
 * and produces the same pair of records - a 'group_to_user' `SwipeAction` and a
 * pending `GroupMatch` - so the invitation lands in the target's matches list
 * alongside organic group likes.
 *
 * Known limitation: the validation and record creation are duplicated from
 * /api/group/:groupId/swipe rather than shared, so the two must be kept in step
 * by hand. The vestigial `swipeReq` object below is a leftover from an earlier
 * attempt to dispatch into that handler directly.
 *
 * @returns 200 on success; 400 when the group is full or already swiped on the
 *          target; 403 for non-members.
 */
app.post('/api/groups/:groupId/invite', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, message } = req.body;
    const groupId = req.params.groupId;
    const inviterId = req.userId;

    // Check if group exists and user is a member
    const group = await Group.findById(groupId);
    if (!group || !group.isActive) {
      return res.status(404).json({ error: 'Group not found or inactive' });
    }

    if (!group.memberIds.map(id => id.toString()).includes(inviterId)) {
      return res.status(403).json({ error: 'Only group members can send invitations' });
    }

    // Use the same logic as group swipe to create a group match
    // This will make the invitation show up in the target user's matches tab
    const swipeBody = {
      targetUserId: targetUserId,
      action: 'like'
    };

    // Call the group swipe logic directly by making an internal request
    const swipeReq = {
      body: swipeBody,
      params: { groupId },
      userId: inviterId
    };

    // Simulate the group swipe endpoint logic
    if (!['like', 'dislike', 'superlike'].includes(swipeBody.action)) {
      return res.status(400).json({ error: 'Invalid swipe action' });
    }

    // Check if group can send likes (not full/paused)
    const validMembers = [];
    for (const memberId of group.memberIds) {
      const member = await User.findById(memberId);
      if (member) {
        validMembers.push(memberId);
      }
    }
    
    if (validMembers.length !== group.memberIds.length) {
      group.memberIds = validMembers;
      group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
      group.group_status = group.target_status === 'full' ? 'paused' : 'active';
      await group.save();
    }
    
    if (!group.canSendLikes()) {
      return res.status(400).json({ 
        error: 'Sorry, your group is full. You cannot send anymore likes!' 
      });
    }

    // Check if target user exists and is active and individual
    const targetUser = await User.findById(targetUserId);
    if (!targetUser || !targetUser.isActive || targetUser.status !== 'individual') {
      return res.status(404).json({ error: 'Target user not found, inactive, or already in a group' });
    }

    // Check if group already swiped on this user
    let existingSwipe = await SwipeAction.findOne({ 
      groupId,
      targetUserId: targetUserId
    });

    if (existingSwipe) {
      return res.status(400).json({ error: 'Group has already swiped on this user' });
    }

    // Create the group swipe action
    const swipeAction = new SwipeAction({
      groupId,
      targetUserId: targetUserId,
      action: swipeBody.action,
      swipeType: 'group_to_user'
    });
    await swipeAction.save();

    // Create a group match (invitation) for the target user
    const groupMatch = new GroupMatch({
      groupId,
      userId: targetUserId,
      initiatedBy: 'group',
      groupMemberInitiator: inviterId,
      status: 'pending'
    });
    await groupMatch.save();

    // Notify the target user
    io.to(targetUserId).emit('newGroupMatch', {
      groupId: group._id,
      groupName: group.name,
      matchId: groupMatch._id
    });

    res.json({ 
      success: true, 
      message: 'Group invitation sent successfully',
      groupMatch: true 
    });
  } catch (error) {
    console.error('Group invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/group-invites/send
 *
 * Invite another individual to form a brand-new group. This is the counterpart
 * to the endpoint above for users who have no group yet: both parties must be
 * individuals, and the result is a `GroupRequest` rather than a `GroupMatch`.
 *
 * @returns 200 on success; 400 when either party is already in a group or a
 *          request is already pending.
 */
app.post('/api/group-invites/send', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, message } = req.body;
    const inviterId = req.userId;

    // Check if inviter is not in a group
    const inviter = await User.findById(inviterId);
    if (!inviter || inviter.status === 'in_group') {
      return res.status(400).json({ error: 'You must be an individual user to send group formation invitations' });
    }

    // Check if target user exists and is not in a group
    const targetUser = await User.findById(targetUserId);
    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ error: 'Target user not found or inactive' });
    }

    if (targetUser.status === 'in_group') {
      return res.status(400).json({ error: 'Target user is already in a group' });
    }

    // Create a group request (invitation to form a new group)
    const existing = await GroupRequest.findOne({
      $or: [
        { requester: inviterId, recipient: targetUserId },
        { requester: targetUserId, recipient: inviterId }
      ],
      status: 'pending'
    });

    if (existing) {
      return res.status(400).json({ error: 'Group formation request already exists between these users' });
    }

    const groupRequest = new GroupRequest({
      requester: inviterId,
      recipient: targetUserId,
      message: message || 'Would you like to form a roommate group together?'
    });
    await groupRequest.save();

    // Notify the target user
    io.to(targetUserId).emit('groupFormationInvite', {
      inviterId: inviterId,
      inviterName: inviter.name,
      message
    });

    res.json({ success: true, message: 'Group formation invitation sent successfully' });
  } catch (error) {
    console.error('Group formation invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// 8. MESSAGING
// ---------------------------------------------------------------------------

/**
 * POST /api/messages
 *
 * Send a message to either a group (`groupId`) or a matched user (`receiverId`);
 * exactly one must be supplied.
 *
 * Authorisation differs by target: group messages require membership, direct
 * messages require an accepted `Match` between sender and receiver. This is what
 * enforces the product rule that users can only talk to people they matched with.
 *
 * The saved message is populated with sender details before being broadcast, so
 * recipients can render it without a follow-up fetch. It is emitted to every
 * group member except the sender (whose own client already has it from the HTTP
 * response).
 *
 * @returns 200 with the saved message; 403 when not matched or not a member.
 */
app.post('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { receiverId, groupId, content } = req.body;
    const senderId = req.userId;
    
    console.log('Message send request:', { senderId, receiverId, groupId, content });
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    // Validate receiver or group
    if (groupId) {
      const group = await Group.findById(groupId);
      if (!group || !group.memberIds.includes(senderId)) {
        return res.status(403).json({ error: 'Access denied to group' });
      }
    } else if (receiverId) {
      // Check if users are matched
      const match = await Match.findOne({
        $or: [
          { userId1: senderId, userId2: receiverId },
          { userId1: receiverId, userId2: senderId }
        ],
        status: 'accepted'
      });
      if (!match) {
        return res.status(403).json({ error: 'Can only message matched users' });
      }
    } else {
      return res.status(400).json({ error: 'Either receiverId or groupId is required' });
    }
    
    const message = new Message({
      senderId,
      receiverId: receiverId || null,
      groupId: groupId || null,
      content: content.trim()
    });
    
    await message.save();
    console.log('Message saved successfully:', message);
    
    // Populate sender information for the response and socket emission
    await message.populate('senderId', 'name photos email');
    
    // Emit message via socket
    if (groupId) {
      const group = await Group.findById(groupId);
      if (group) {
        group.memberIds.forEach(memberId => {
          if (memberId.toString() !== senderId) {
            io.to(memberId.toString()).emit('message', message);
          }
        });
      }
    } else {
      io.to(receiverId).emit('message', message);
    }
    
    res.json(message);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/groups/:groupId/join-requests
 * List the join requests addressed to a group, for its members to review.
 * @returns 200 with the populated requests; 403 for non-members.
 */
app.get('/api/groups/:groupId/join-requests', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (!group.memberIds.map(id => id.toString()).includes(userId)) {
      return res.status(403).json({ error: 'Only group members can view join requests' });
    }

    const requests = await GroupJoinRequest.find({ groupId }).populate('requester', 'name photos email');
    res.json({ success: true, requests });
  } catch (err) {
    console.error('Get group join requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/matches/:matchId/accept
 *
 * Accept an individual match. The caller must be one of the two parties, and a
 * caller whose group is already full is refused - accepting would imply a
 * conversation they cannot act on.
 *
 * @returns 200 with the updated match; 400 when the caller's group is full.
 */
app.post('/api/matches/:matchId/accept', authMiddleware, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Check if user is part of this match
    if (match.userId1.toString() !== req.userId && match.userId2.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if user is in a full group
    const user = await User.findById(req.userId).populate('groupId');
    if (user && user.status === 'in_group' && user.groupId) {
      const group = user.groupId;
      if (group.target_status === 'full') {
        return res.status(400).json({ 
          error: 'Sorry, your group is full. You cannot accepted any more requests !' 
        });
      }
    }
    
    // Update match status to accepted
    match.status = 'accepted';
    await match.save();
    
    console.log('Match accepted:', match._id, 'status:', match.status);
    res.json({ success: true, match });
  } catch (error) {
    console.error('Accept match error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/group-matches/:groupMatchId/accept
 *
 * Accept an invitation to join a group. This is the transition that turns an
 * individual into a group member, and it is deliberately ordered so that the
 * irreversible steps happen only once every precondition has passed.
 *
 * Preconditions: the caller is the invitation's target, the invitation is still
 * pending, the group still exists and has room, and the caller is still an
 * individual.
 *
 * Then, in order:
 *   1. Snapshot the caller's swipes and matches into `UserGroupHistory`, so the
 *      deletion in step 2 is recoverable.
 *   2. Delete every swipe and pending/accepted match involving the caller, and
 *      emit `matchInvalidated` to each affected counterpart so their open
 *      clients drop the now-dead cards.
 *   3. Add the caller to the group and save it.
 *   4. Move the caller to 'in_group' with a paused profile.
 *   5. Only now mark the invitation accepted, and delete the caller's other
 *      pending invitations - they can only join one group.
 *   6. Post a system message to the group thread and notify all members.
 *
 * The step ordering matters: marking the invitation accepted early would leave
 * an unjoinable "accepted" record behind if a later step threw.
 *
 * @returns 200 on success; 400 when the group is full or the caller is no longer
 *          an individual; 403 when the invitation is not theirs.
 */
app.post('/api/group-matches/:groupMatchId/accept', authMiddleware, async (req, res) => {
  try {
    console.log('=== ACCEPT GROUP MATCH DEBUG ===');
    console.log('GroupMatchId:', req.params.groupMatchId);
    console.log('UserId:', req.userId);
    
    const groupMatch = await GroupMatch.findById(req.params.groupMatchId).populate('groupId');
    console.log('GroupMatch found:', !!groupMatch);
    if (!groupMatch) {
      console.log('ERROR: Group match not found');
      return res.status(404).json({ error: 'Group match not found' });
    }
    console.log('GroupMatch details:', {
      _id: groupMatch._id,
      userId: groupMatch.userId,
      groupId: groupMatch.groupId?._id,
      status: groupMatch.status
    });
    
    // Check if user is the target of this group match
    console.log('Checking user authorization...');
    if (groupMatch.userId.toString() !== req.userId) {
      console.log('ERROR: Access denied - user mismatch');
      return res.status(403).json({ error: 'Access denied' });
    }
    console.log('✓ User authorization passed');
    
    // Check if group match is still pending
    console.log('Checking group match status...');
    if (groupMatch.status !== 'pending') {
      console.log('ERROR: Group match is not pending, current status:', groupMatch.status);
      return res.status(400).json({ error: 'Group match is not pending' });
    }
    console.log('✓ Group match status is pending');
    
    // Check if group still exists and can accept members
    console.log('Checking group availability...');
    const group = groupMatch.groupId;
    console.log('Group details:', {
      exists: !!group,
      isActive: group?.isActive,
      canAddMember: group?.canAddMember(),
      currentMembers: group?.memberIds?.length,
      maxMembers: group?.maxMembers
    });
    if (!group || !group.isActive || !group.canAddMember()) {
      console.log('ERROR: Group is no longer available or full');
      return res.status(400).json({ error: 'Group is no longer available or full' });
    }
    console.log('✓ Group is available and can accept members');
    
    // Check if user can join groups (is individual)
    console.log('Checking user status...');
    const user = await User.findById(req.userId);
    console.log('User details:', {
      exists: !!user,
      status: user?.status,
      currentGroupId: user?.groupId
    });
    if (!user || user.status !== 'individual') {
      console.log('ERROR: User cannot join groups - not individual status');
      return res.status(400).json({ 
        error: 'Sorry, your group is full. You cannot accepted any more requests !' 
      });
    }
    console.log('✓ User can join groups');
    
    // Store user's current swipe actions and matches before deleting
    console.log('Storing user data before cleanup...');
    const userSwipeActions = await SwipeAction.find({ userId: req.userId });
    const userMatches = await Match.find({
      $or: [
        { userId1: req.userId, status: { $in: ['pending', 'accepted'] } },
        { userId2: req.userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });
    console.log('Found data to store:', {
      swipeActionsCount: userSwipeActions.length,
      matchesCount: userMatches.length
    });
    
    // Create history record
    console.log('Creating history record...');
    try {
      const groupHistory = new UserGroupHistory({
        userId: req.userId,
        groupId: group._id,
        deletedSwipeActions: userSwipeActions.map(swipe => ({
          _id: swipe._id,
          userId: swipe.userId,
          targetUserId: swipe.targetUserId,
          action: swipe.action,
          swipeType: swipe.swipeType || 'user_to_user',
          createdAt: swipe.createdAt,
          updatedAt: swipe.updatedAt
        })),
        deletedMatches: userMatches.map(match => ({
          _id: match._id,
          userId1: match.userId1,
          userId2: match.userId2,
          status: match.status,
          createdAt: match.createdAt,
          updatedAt: match.updatedAt,
          expiresAt: match.expiresAt
        }))
      });
      await groupHistory.save();
      console.log('✓ History record created successfully');
    } catch (historyError) {
      console.error('ERROR creating history record:', historyError);
      throw historyError;
    }
    
    // Delete/expire user's pending likes and matches as they're joining a group
    // First, get all SwipeActions involving this user (for notifications - broader scope than history)
    const allUserSwipeActions = await SwipeAction.find({ 
      $or: [
        { userId: req.userId },
        { targetUserId: req.userId }
      ]
    });

    // Get all matches involving this user (for notifications - broader scope than history)
    const allUserMatches = await Match.find({
      $or: [
        { userId1: req.userId, status: { $in: ['pending', 'accepted'] } },
        { userId2: req.userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });

    // Delete all SwipeActions involving this user
    await SwipeAction.deleteMany({ 
      $or: [
        { userId: req.userId },
        { targetUserId: req.userId }
      ]
    });

    // Delete all matches involving this user  
    await Match.deleteMany({
      $or: [
        { userId1: req.userId, status: { $in: ['pending', 'accepted'] } },
        { userId2: req.userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });

    // Notify other users about invalidated matches and pending matches
    allUserSwipeActions.forEach(swipe => {
      // Check for null/undefined values to prevent crashes
      if (!swipe.userId || !swipe.targetUserId) {
        console.warn('Skipping notification for swipe with missing userId or targetUserId:', swipe._id);
        return;
      }
      
      const otherUserId = swipe.userId.toString() === req.userId ? swipe.targetUserId.toString() : swipe.userId.toString();
      if (otherUserId !== req.userId) {
        const pendingMatchId = `pending_${swipe._id}`;
        io.to(otherUserId).emit('matchInvalidated', { 
          matchId: pendingMatchId,
          reason: 'User joined a group' 
        });
      }
    });

    allUserMatches.forEach(match => {
      // Check for null/undefined values to prevent crashes
      if (!match.userId1 || !match.userId2) {
        console.warn('Skipping notification for match with missing userId1 or userId2:', match._id);
        return;
      }
      
      const otherUserId = match.userId1.toString() === req.userId 
        ? match.userId2.toString() 
        : match.userId1.toString();
      if (otherUserId !== req.userId) {
        io.to(otherUserId).emit('matchInvalidated', { 
          matchId: match._id.toString(),
          reason: 'User joined a group' 
        });
      }
    });
    
    // Add user to group
    console.log('Adding user to group...');
    try {
      const addResult = group.addMember(req.userId);
      console.log('Add member result:', addResult);
      console.log('Group members after add:', group.memberIds.length);
      await group.save();
      console.log('✓ Group saved');
    } catch (groupSaveError) {
      console.error('ERROR saving group:', groupSaveError);
      throw groupSaveError;
    }
    
    // Update user status
    console.log('Updating user status...');
    try {
      await User.findByIdAndUpdate(req.userId, {
        status: 'in_group',
        profileStatus: 'paused',
        groupId: group._id
      });
      console.log('✓ User status updated');
    } catch (userUpdateError) {
      console.error('ERROR updating user status:', userUpdateError);
      throw userUpdateError;
    }
    
    // Update group match status to accepted ONLY after everything else succeeds
    console.log('Updating group match status...');
    groupMatch.status = 'accepted';
    await groupMatch.save();
    console.log('✓ Group match status updated');
    
    // Delete other pending group matches for this user
    console.log('Deleting other pending group matches...');
    const deleteResult = await GroupMatch.deleteMany({
      userId: req.userId,
      _id: { $ne: groupMatch._id },
      status: 'pending'
    });
    console.log('Deleted group matches:', deleteResult.deletedCount);
    
    // Add system message to group chat when user joins
    console.log('Adding system message for user joining...');
    try {
      const user = await User.findById(req.userId);
      if (user) {
        const systemMessage = new Message({
          senderId: null, // System message
          groupId: group._id,
          content: `${user.name} has joined the group chat`,
          messageType: 'system'
        });
        await systemMessage.save();
        console.log('✓ System message added for user joining');
      }
    } catch (messageError) {
      console.error('ERROR adding join system message:', messageError);
      // Don't fail the entire operation if message creation fails
    }
    
    console.log('Group match accepted:', groupMatch._id, 'User', req.userId, 'joined group', group._id);
    
    // Notify all group members about the new member joining
    group.memberIds.forEach(memberId => {
      io.to(memberId.toString()).emit('groupUpdated', {
        groupId: group._id.toString(),
        action: 'member_joined',
        newMemberId: req.userId
      });
    });
    
    res.json({ 
      success: true, 
      groupMatch,
      message: 'Successfully joined group!' 
    });
  } catch (error) {
    console.error('Accept group match error - Full details:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request params:', req.params);
    console.error('User ID:', req.userId);
    
    // Provide more specific error message
    let errorMessage = 'Server error';
    if (error.message) {
      errorMessage = `Server error: ${error.message}`;
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * POST /api/group-matches/:groupMatchId/decline
 *
 * Decline a group invitation. The record is kept rather than deleted so the
 * group is not able to immediately re-invite the same user.
 *
 * KNOWN ISSUE: this writes the status 'declined', which is not one of the values
 * in the GroupMatch status enum ('pending' | 'accepted' | 'rejected' |
 * 'expired'), so the save fails validation and the endpoint returns a 500. The
 * intended value is 'rejected'. Left unchanged here because this pass is
 * documentation-only.
 *
 * @returns 200 on success; 403 when the invitation is not the caller's.
 */
app.post('/api/group-matches/:groupMatchId/decline', authMiddleware, async (req, res) => {
  try {
    const groupMatchId = req.params.groupMatchId;
    const userId = req.userId;
    
    console.log('Declining group match:', groupMatchId, 'for user:', userId);
    
    // Find and verify the group match
    const groupMatch = await GroupMatch.findById(groupMatchId);
    
    if (!groupMatch) {
      return res.status(404).json({ error: 'Group match not found' });
    }
    
    // Check if user is the target of this group match
    if (groupMatch.userId.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if group match is still pending
    if (groupMatch.status !== 'pending') {
      return res.status(400).json({ error: 'Group match is not pending' });
    }
    
    // Update group match status to declined
    groupMatch.status = 'declined';
    await groupMatch.save();
    
    console.log('Group match declined successfully:', groupMatchId);
    
    res.json({ 
      success: true, 
      message: 'Group invitation declined successfully' 
    });
  } catch (error) {
    console.error('Decline group match error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /api/matches/:matchId/unmatch
 *
 * Permanently undo a match. The match document, the swipe actions in both
 * directions and the direct messages between the pair are all deleted.
 *
 * Removing the swipes is intentional rather than incidental: with no swipe
 * history, each user re-enters the other's deck and the pair can match again
 * later. Group messages are untouched because the `groupId: null` filter
 * restricts the deletion to the direct thread.
 *
 * @returns 200 on success; 403 when the caller is not part of the match.
 */
app.delete('/api/matches/:matchId/unmatch', authMiddleware, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Check if user is part of this match
    if (match.userId1.toString() !== req.userId && match.userId2.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get user IDs for cleanup
    const userId1 = match.userId1.toString();
    const userId2 = match.userId2.toString();
    
    // Delete the match
    await Match.findByIdAndDelete(req.params.matchId);
    
    // Delete swipe actions between these users so they can match again
    await SwipeAction.deleteMany({
      $or: [
        { userId: userId1, targetUserId: userId2 },
        { userId: userId2, targetUserId: userId1 }
      ]
    });
    
    // Also delete any messages between these users
    await Message.deleteMany({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ],
      groupId: null
    });
    
    console.log('Match deleted and swipe history cleared for future rematching:', req.params.matchId);
    res.json({ success: true, message: 'Successfully unmatched - users can now match again' });
  } catch (error) {
    console.error('Unmatch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/matches/:matchId/decline
 *
 * Decline a match that is still pending. The record is marked 'rejected' rather
 * than deleted, which keeps the swipe history intact and so prevents the
 * declined user from immediately reappearing in the decliner's deck.
 *
 * @returns 200 on success; 400 for a non-pending match; 403 for a third party.
 */
app.post('/api/matches/:matchId/decline', authMiddleware, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Check if user is part of this match
    if (match.userId1.toString() !== req.userId && match.userId2.toString() !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Only allow declining pending matches
    if (match.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending matches can be declined' });
    }
    
    // Update match status to rejected instead of deleting
    match.status = 'rejected';
    await match.save();
    
    console.log('Match declined:', req.params.matchId);
    res.json({ success: true, message: 'Match declined successfully' });
  } catch (error) {
    console.error('Decline match error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/group-conversations
 *
 * Return the caller's group conversation, as a single-element array so the
 * client can concatenate it with the individual conversation list. Users who are
 * not in a group receive an empty array.
 *
 * Members whose accounts have since been deleted are filtered out of the
 * returned member list, since Mongoose populates a missing reference as null.
 */
app.get('/api/group-conversations', authMiddleware, async (req, res) => {
  try {
    console.log('Loading group conversations for user:', req.userId);
    const currentUser = await User.findById(req.userId).populate('groupId');
    console.log('Current user:', currentUser.name, 'groupId:', currentUser.groupId, 'status:', currentUser.status);
    
    if (!currentUser.groupId || currentUser.status !== 'in_group') {
      console.log('User not in group, returning empty array');
      return res.json([]);
    }

    // Get group with all members
    const group = await Group.findById(currentUser.groupId).populate('memberIds', 'name photos email');
    console.log('Found group:', group?.name, 'with members:', group?.memberIds?.map(m => m?.name || 'NULL_MEMBER'));
    
    // Debug: Check for null members
    if (group?.memberIds?.some(m => !m || !m._id)) {
      console.warn('⚠️  Group has null/invalid members:', group.memberIds.map((m, i) => `${i}: ${m?.name || 'NULL'}`));
    }
    
    if (!group) {
      console.log('Group not found, returning empty array');
      return res.json([]);
    }

    // Get the latest message in this group
    const latestMessage = await Message.findOne({
      groupId: group._id
    }).sort({ createdAt: -1 });

    const conversation = {
      id: `group_${group._id}`,
      groupId: group._id,
      groupName: group.name,
      members: group.memberIds.filter(member => member && member._id).map(member => ({
        id: member._id,
        name: member.name,
        photo: member.photos?.[0] || null,
        email: member.email
      })),
      lastMessage: latestMessage,
      updatedAt: latestMessage?.createdAt || group.updatedAt,
      isGroup: true,
      maxMembers: group.maxMembers || 8
    };

    console.log('Returning group conversation:', conversation);
    res.json([conversation]);
  } catch (error) {
    console.error('Get group conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/conversations
 *
 * List the caller's one-to-one conversations, derived from their accepted
 * matches. A user who is in a group receives an empty array - group membership
 * replaces individual messaging entirely.
 *
 * Two classes of match are skipped: orphaned ones whose counterpart account no
 * longer exists, and ones whose counterpart has since joined a group.
 *
 * Conversation ids are built by sorting the two user ids and joining them with
 * an underscore, so both participants independently derive the same id for the
 * same thread - that id is what GET /api/messages/:conversationId expects.
 */
app.get('/api/conversations', authMiddleware, async (req, res) => {
  try {
    // Get current user to check their status
    const currentUser = await User.findById(req.userId);
    
    // If user is in a group, don't show individual conversations
    if (currentUser.status === 'in_group') {
      return res.json([]);
    }
    
    // Get all matches for the user where both users have swiped right and status is accepted
    const userMatches = await Match.find({
      $or: [
        { userId1: req.userId },
        { userId2: req.userId }
      ],
      status: 'accepted' // Both users liked each other and match is accepted
    }).populate('userId1 userId2', 'name photos email status');
    
    // Format conversations with the other user's info
    const conversations = userMatches
      .map(match => {
        const otherUser = match.userId1?._id?.toString() === req.userId ? match.userId2 : match.userId1;
        
        // Skip if other user doesn't exist (orphaned match)
        if (!otherUser || !otherUser._id) {
          console.log('Skipping orphaned match:', match._id, 'missing user data');
          return null;
        }
        
        // Skip if other user is in a group (they can't have individual conversations anymore)
        if (otherUser.status === 'in_group') {
          console.log('Skipping user in group:', otherUser.name);
          return null;
        }
        
        return {
          id: `${req.userId < otherUser._id.toString() ? req.userId : otherUser._id.toString()}_${req.userId < otherUser._id.toString() ? otherUser._id.toString() : req.userId}`,
          matchId: match._id,
          otherUser: {
            id: otherUser._id,
            name: otherUser.name,
            photo: otherUser.photos?.[0] || null,
            email: otherUser.email
          },
          lastMessage: null, // Will be filled by client if needed
          updatedAt: match.updatedAt
        };
      })
      .filter(conversation => conversation !== null); // Remove null entries
    
    console.log('Returning conversations for user:', req.userId, conversations.length);
    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/messages/group/:groupId
 * Return up to the 100 oldest-first messages in a group, for its members only.
 * @returns 200 with the messages; 403 when the caller is not in the group.
 */
app.get('/api/messages/group/:groupId', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const userId = req.userId;
    
    // Verify user is in this group
    const user = await User.findById(userId);
    if (!user || user.groupId?.toString() !== groupId) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    // Get messages for this group
    const messages = await Message.find({ groupId })
      .populate('senderId', 'name email')
      .sort({ createdAt: 1 })
      .limit(100);
    
    res.json(messages);
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/messages/:conversationId
 *
 * Return the messages in a conversation. The id encodes which kind of thread is
 * being requested:
 *   - `group_<groupId>`     - a group thread; the caller must be a member.
 *   - `<userId>_<userId>`   - a direct thread; the caller must be one of the two.
 *
 * Direct-thread ids are validated strictly (two segments, each a 24-character
 * ObjectId) before being cast, because a malformed id would otherwise throw
 * inside the query builder. The pair is matched in both sender/receiver
 * directions, with `groupId: null` restricting results to the direct thread.
 *
 * Results are oldest-first and capped at 100 messages; there is no pagination
 * yet, so older history in a long thread is not reachable.
 *
 * Note: the sample-message dump and the two "simple query" probes below are
 * diagnostics left over from debugging an issue where direct threads returned
 * empty. They issue extra reads on every request and should be removed.
 *
 * @returns 200 with the messages; 400 on a malformed id; 403 when not a participant.
 */
app.get('/api/messages/:conversationId', authMiddleware, async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    let query = {};
    
    if (conversationId.startsWith('group_')) {
      const groupId = conversationId.replace('group_', '');
      const group = await Group.findById(groupId);
      if (!group || !group.memberIds.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied to group messages' });
      }
      query = { groupId };
    } else {
      // Direct message conversation - format: userId1_userId2
      const userIds = conversationId.split('_');
      console.log('Processing direct message conversation. UserIds:', userIds);
      console.log('Request userId:', req.userId);
      
      // Validate user IDs
      if (userIds.length !== 2) {
        return res.status(400).json({ error: 'Invalid conversation ID format' });
      }
      
      // Check for undefined or invalid user IDs
      if (userIds.includes('undefined') || userIds.some(id => !id || id.length !== 24)) {
        console.log('Invalid user IDs detected:', userIds);
        return res.status(400).json({ error: 'Invalid user IDs in conversation' });
      }
      
      if (!userIds.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied to conversation' });
      }
      
      console.log('Creating ObjectId query for userIds:', userIds);
      try {
        query = {
          $and: [
            { groupId: null },
            {
              $or: [
                { senderId: new mongoose.Types.ObjectId(userIds[0]), receiverId: new mongoose.Types.ObjectId(userIds[1]) },
                { senderId: new mongoose.Types.ObjectId(userIds[1]), receiverId: new mongoose.Types.ObjectId(userIds[0]) }
              ]
            }
          ]
        };
        console.log('ObjectId query created successfully');
      } catch (objectIdError) {
        console.error('Failed to create ObjectId from userIds:', userIds, objectIdError);
        return res.status(400).json({ error: 'Invalid user ID format' });
      }
    }
    
    console.log('Message query:', JSON.stringify(query, null, 2));
    console.log('Actual query with ObjectIds:', query);
    
    // Also try a simple query to see all messages for debugging
    const allMessages = await Message.find({}).limit(5);
    console.log('Sample messages in database:', allMessages.map(m => ({
      id: m._id,
      senderId: m.senderId,
      receiverId: m.receiverId,
      content: m.content
    })));
    
    // Test with simplified queries (only for direct messages)
    if (!conversationId.startsWith('group_')) {
      const userIds = conversationId.split('_');
      
      // Test 1: Simple query without groupId condition
      const simpleQuery = {
        $or: [
          { senderId: userIds[0], receiverId: userIds[1] },
          { senderId: userIds[1], receiverId: userIds[0] }
        ]
      };
      const simpleMessages = await Message.find(simpleQuery);
      console.log(`Simple query returned ${simpleMessages.length} messages`);
      
      // Test 2: Just check for null groupId  
      const nullGroupQuery = {
        $and: [
          { groupId: null },
          {
            $or: [
              { senderId: userIds[0], receiverId: userIds[1] },
              { senderId: userIds[1], receiverId: userIds[0] }
            ]
          }
        ]
      };
      const nullGroupMessages = await Message.find(nullGroupQuery);
      console.log(`Null groupId query returned ${nullGroupMessages.length} messages`);
    }
    
    const messages = await Message.find(query)
      .populate('senderId', 'name photos')
      .sort({ createdAt: 1 })
      .limit(100);
    
    console.log(`Query returned ${messages.length} messages for conversation: ${conversationId}`);
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// 9. REAL-TIME LAYER
// ---------------------------------------------------------------------------

/**
 * Socket.io handshake authentication.
 *
 * Applies the same rules as the HTTP middleware - verify the JWT, re-read the
 * account, reject deactivated users - and stashes the resolved user on the
 * socket. Rejecting here rather than per-event means no unauthenticated socket
 * is ever able to join a room.
 */
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return next(new Error('Authentication error: Invalid token or user not found'));
    }

    if (user.profileStatus === 'deactivated') {
      return next(new Error('Authentication error: Account is deactivated'));
    }

    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (err) {
    console.error('Socket authentication error:', err);
    next(new Error('Authentication error'));
  }
});

/**
 * Connection handler.
 *
 * Every socket immediately joins a room named after its user id. All server-side
 * notifications in this file are addressed with `io.to(userId).emit(...)`, so a
 * user receives them on every device and tab they have open. The explicit
 * 'join' event is retained for backward compatibility with an earlier client and
 * only verifies that the requested room matches the authenticated user.
 */
io.on('connection', (socket) => {
  console.log('User connected:', socket.id, 'User ID:', socket.userId);
  
  // Automatically join user to their own room for receiving messages
  socket.join(socket.userId);
  console.log(`User ${socket.userId} joined room`);
  
  socket.on('join', (userId) => {
    // Additional join logic if needed, but user is already joined to their room
    if (userId === socket.userId) {
      console.log(`User ${userId} confirmed in room`);
    } else {
      console.log('Warning: User trying to join different room');
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id, 'User ID:', socket.userId);
  });
});

// ---------------------------------------------------------------------------
// 10. STARTUP
// ---------------------------------------------------------------------------

/**
 * Idempotent data migrations, run once at boot before the sample data is seeded.
 *
 * Two corrections are applied to documents written by earlier revisions:
 *   1. Users predating the `profileStatus` field are backfilled to 'active'.
 *   2. Users in a group who were incorrectly written as `isActive: false` or
 *      'deactivated' are restored to active/paused. An earlier version of the
 *      group-join code deactivated members, which locked them out of logging in;
 *      the correct state for a group member is an active account with a paused
 *      profile.
 *
 * Errors are logged rather than thrown so a migration problem cannot prevent the
 * server from starting.
 */
const runMigrations = async () => {
  try {
    console.log('Running database migrations...');
    
    // Migration: Ensure all users have profileStatus field set to 'active' if not already set
    const usersWithoutProfileStatus = await User.find({ 
      $or: [
        { profileStatus: { $exists: false } },
        { profileStatus: null },
        { profileStatus: '' }
      ]
    });
    
    if (usersWithoutProfileStatus.length > 0) {
      console.log(`Found ${usersWithoutProfileStatus.length} users without profileStatus field. Updating...`);
      
      const updateResult = await User.updateMany(
        { 
          $or: [
            { profileStatus: { $exists: false } },
            { profileStatus: null },
            { profileStatus: '' }
          ]
        },
        { 
          $set: { profileStatus: 'active' }
        }
      );
      
      console.log(`Updated ${updateResult.modifiedCount} users with profileStatus: 'active'`);
    } else {
      console.log('All users already have profileStatus field set');
    }
    
    // Migration: Fix users who were incorrectly set to isActive: false when joining groups
    console.log('Checking for users incorrectly deactivated by group creation...');
    const incorrectlyDeactivatedUsers = await User.find({
      status: 'in_group',
      $or: [
        { isActive: false },
        { profileStatus: 'deactivated' }
      ]
    });
    
    if (incorrectlyDeactivatedUsers.length > 0) {
      console.log(`Found ${incorrectlyDeactivatedUsers.length} users incorrectly deactivated. Fixing...`);
      
      await User.updateMany(
        { 
          status: 'in_group',
          $or: [
            { isActive: false },
            { profileStatus: 'deactivated' }
          ]
        },
        { 
          $set: { 
            isActive: true,
            profileStatus: 'paused' // Users in groups should be paused, not deactivated
          }
        }
      );
      
      console.log(`Fixed ${incorrectlyDeactivatedUsers.length} incorrectly deactivated group users`);
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running database migrations:', error);
  }
};

/**
 * POST /api/admin/reset-all
 *
 * DESTRUCTIVE, development only. Deletes every group, match, message, swipe and
 * request, and resets all users to active individuals. User accounts themselves
 * are preserved, so logins keep working against a clean relational slate.
 *
 * Refused outright when NODE_ENV is 'production'. Note there is no role check
 * beyond authentication - any signed-in user may call it in a development
 * environment. The equivalent offline tool is reset_all_users.js in the
 * repository root.
 *
 * @returns 200 with per-collection deletion counts; 403 in production.
 */
app.post('/api/admin/reset-all', authMiddleware, async (req, res) => {
  try {
    console.log('🚨 RESET ALL USERS requested by user:', req.userId);
    
    // For security, only allow in development or with special authorization
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Reset not allowed in production' });
    }
    
    console.log('\n⚠️  WARNING: Resetting ALL users to fresh state!');
    
    // Count documents before deletion
    const counts = {
      groups: await Group.countDocuments(),
      matches: await Match.countDocuments(),
      messages: await Message.countDocuments(),
      swipeActions: await SwipeAction.countDocuments(),
      groupJoinRequests: await GroupJoinRequest.countDocuments(),
      groupRequests: await GroupRequest.countDocuments(),
      groupMatches: await GroupMatch.countDocuments(),
      userGroupHistories: await UserGroupHistory.countDocuments()
    };
    
    // Delete all interaction data
    await Group.deleteMany({});
    await Match.deleteMany({});
    await Message.deleteMany({});
    await SwipeAction.deleteMany({});
    await GroupJoinRequest.deleteMany({});
    await GroupRequest.deleteMany({});
    await GroupMatch.deleteMany({});
    await UserGroupHistory.deleteMany({});
    
    // Reset all users to individual status
    const users = await User.find({});
    
    for (const user of users) {
      user.status = 'individual';
      user.profileStatus = 'active';
      user.isActive = true;
      user.groupId = null;
      await user.save();
    }
    
    console.log('✅ Reset completed successfully');
    console.log('Summary:');
    console.log(`- ${users.length} users reset to individual status`);
    console.log(`- ${counts.groups} groups deleted`);
    console.log(`- ${counts.matches} matches deleted`);
    console.log(`- ${counts.messages} messages deleted`);
    console.log(`- ${counts.swipeActions} swipe actions deleted`);
    console.log(`- ${counts.groupJoinRequests} group join requests deleted`);
    console.log(`- ${counts.groupRequests} group requests deleted`);
    console.log(`- ${counts.groupMatches} group matches deleted`);
    console.log(`- ${counts.userGroupHistories} user group histories deleted`);
    
    res.json({
      success: true,
      message: 'All users reset successfully! Everyone can start fresh.',
      resetCounts: {
        usersReset: users.length,
        ...counts
      }
    });
    
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: 'Failed to reset users' });
  }
});

// Migrations must complete before seeding, since the seed writes documents the
// migrations would otherwise have to correct.
runMigrations().then(() => {
  initializeSampleData();
});

// Bind on 0.0.0.0 so the server is reachable from other devices on the local
// network, not just localhost. If the port is taken the listener retries once on
// PORT + 1 rather than exiting, which keeps restarts working while a previous
// process is still shutting down.
// Note: the default of 5001 here differs from the 3333 used in the .env file and
// the documentation; PORT should be set explicitly.
const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://10.0.0.204:${PORT}`);
}).on('error', (err) => {
  console.error('Server failed to start:', err);
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use. Trying port ${PORT + 1}...`);
    server.listen(PORT + 1, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT + 1}`);
    });
  }
});
