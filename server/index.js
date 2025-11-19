/**
 * SERVER MAIN ENTRY POINT - Express.js backend for Homey roommate finder app
 * Connects to MongoDB and sets up REST API and Socket.io for real-time features.
 * MongoDB models for User, Group, Match, SwipeAction, and Message are imported.
 * You then use the Model from a schema (fields your document has) to create, read, update, delete documents. ( documents being a object, like a user object)
 * Handles user authentication, matchmaking, group management, and real-time messaging.
 * Provides REST API endpoints for user registration, swipe actions, matches, group voting system,
 * and message handling. Uses MongoDB for data persistence and Socket.io for real-time features.
 * Implements JWT authentication with 7-day token expiry and CORS for client communication.
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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Security middleware
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

// Serve the client build files
app.use(express.static('../client/dist'));

// Auth routes
app.use('/api/auth', authRoutes);

// Debug route to see all users (remove in production)
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

// Initialize sample data if database is empty  
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

// API Routes

// Get current user (protected)
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

// Get potential matches
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
        memberIds: { $nin: [req.params.id] }
      }).limit(50).lean();

      console.log('Potential-matches: found candidateGroups count=', (candidateGroups || []).length);

      const groupEntries = candidateGroups
        .filter(g => (Array.isArray(g.memberIds) ? g.memberIds.length : 0) < (g.maxMembers || 4))
        .map(g => ({
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
          updatedAt: g.updatedAt
        }));

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

// Swipe action
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

    // Check if already swiped
    const existingSwipe = await SwipeAction.findOne({ userId, targetUserId });
    if (existingSwipe) {
      return res.status(400).json({ error: 'Already swiped on this user' });
    }

    // Create swipe action
    const swipeAction = new SwipeAction({
      userId,
      targetUserId,
      action
    });
    
    await swipeAction.save();
    
    // Check for match if it's a like
    if (action === 'like' || action === 'superlike') {
      const reverseSwipe = await SwipeAction.findOne({
        userId: targetUserId,
        targetUserId: userId,
        action: { $in: ['like', 'superlike'] }
      });
      
      if (reverseSwipe) {
        // Create match
        const match = new Match({
          userId1: userId,
          userId2: targetUserId,
          status: 'pending'
        });
        
        await match.save();
        
        // Notify both users via socket
        io.to(userId).emit('match', match);
        io.to(targetUserId).emit('match', match);
        
        return res.json({ 
          success: true, 
          match: true, 
          matchId: match._id 
        });
      }
    }
    
    res.json({ success: true, match: false });
  } catch (error) {
    console.error('Swipe error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get matches for user
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
    
    // Create pending match objects for incoming likes that aren't already matches
    console.log('Processing pending matches...');
    const pendingMatches = incomingLikes
      .filter(like => {
        if (!like.userId) {
          console.log('Warning: SwipeAction has no populated userId:', like._id);
          return false;
        }
        return !userMatches.some(match => 
          (match.userId1?._id?.toString() === like.userId?._id?.toString()) ||
          (match.userId2?._id?.toString() === like.userId?._id?.toString())
        );
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
    
    // Combine real matches and pending matches
    const allMatches = [...userMatches, ...pendingMatches];
    
    console.log('Returning matches for user:', req.params.id);
    console.log('Real matches:', userMatches.length);
    console.log('Pending matches:', pendingMatches.length);
    
    // ----- NEW: include active candidate group profiles so users can see groups on their feed -----
    try {
      const candidateGroups = await Group.find({
        isActive: true,
        memberIds: { $nin: [req.params.id] }
      }).limit(50).lean();

      const groupMatches = candidateGroups
        .filter(g => (Array.isArray(g.memberIds) ? g.memberIds.length : 0) < (g.maxMembers || 4))
        .map(g => ({
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
          status: 'group_available'
        }));

      allMatches.push(...groupMatches);
      console.log(`Added ${groupMatches.length} group(s) to matches for user ${req.params.id}`);
    } catch (err) {
      console.error('Error loading candidate groups for matches:', err);
    }
    // --------------------------------------------------------------------------

    res.json(allMatches);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create group
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

// Get user's group
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

// Propose member to group
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

// Vote on proposed member
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

// Group Request Endpoints

// Send group request
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

// Get group requests (sent and received)
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

// Get group requests for a specific conversation
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

// Respond to group request (accept/reject)
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
      
      // Merge preferences (take more restrictive/compatible values)
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

// Get group by ID
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

// Update group
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

    await group.save();

    // Return populated group
    await group.populate('memberIds', 'name photos email');
    
    res.json(group);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave group
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

    // Update user status back to individual
    await User.findByIdAndUpdate(userId, {
      status: 'individual',
      groupId: null,
      profileStatus: 'active', // Restore active profile
      isActive: true // Keep for backward compatibility
    });

    // If group becomes empty or has only 1 member, delete it
    if (group.memberIds.length <= 1) {
      // Update remaining member (if any) back to individual
      if (group.memberIds.length === 1) {
        await User.findByIdAndUpdate(group.memberIds[0], {
          status: 'individual',
          groupId: null,
          profileStatus: 'active', // Restore active profile
          isActive: true // Keep for backward compatibility
        });
        
        // Notify remaining member
        io.to(group.memberIds[0].toString()).emit('groupDissolved', {
          message: 'Your group has been dissolved because the other member left.'
        });
      }
      
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
      
      // Notify remaining group members
      group.memberIds.forEach(memberId => {
        io.to(memberId.toString()).emit('memberLeft', {
          groupId: group._id,
          leftUserId: userId,
          leftUserName: user.name
        });
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

  // Send join request to a group
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

  // Admin endpoint for group members to accept/reject join requests
  app.post('/api/groups/:groupId/join-request/:requestId/respond', authMiddleware, async (req, res) => {
    try {
      const { action } = req.body; // 'accept' or 'reject'
      const { groupId, requestId } = req.params;
      const userId = req.userId;

      if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      const group = await Group.findById(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      // Only existing group members can respond
      if (!group.memberIds.map(id => id.toString()).includes(userId)) {
        return res.status(403).json({ error: 'Only group members can respond to join requests' });
      }

      const joinRequest = await GroupJoinRequest.findById(requestId);
      if (!joinRequest) return res.status(404).json({ error: 'Request not found' });

      if (joinRequest.status !== 'pending') return res.status(400).json({ error: 'Request already handled' });

      if (action === 'accept') {
        // Add to group
        group.memberIds.push(joinRequest.requester);
        await group.save();

        // Update user
        await User.findByIdAndUpdate(joinRequest.requester, {
          groupId: group._id,
          status: 'in_group',
          profileStatus: 'paused',
          isActive: true
        });

        // Mark joinRequest accepted
        joinRequest.status = 'accepted';
        await joinRequest.save();

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
      res.status(500).json({ error: 'Server error' });
    }
  });

// Send message
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

// Get join requests for a group (only visible to group members)
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

// Accept match endpoint
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

// Unmatch endpoint
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

// Decline pending match endpoint
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

// Get user's group conversations 
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
    console.log('Found group:', group?.name, 'with members:', group?.memberIds?.map(m => m.name));
    
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
      members: group.memberIds.map(member => ({
        id: member._id,
        name: member.name,
        photo: member.photos?.[0] || null,
        email: member.email
      })),
      lastMessage: latestMessage,
      updatedAt: latestMessage?.createdAt || group.updatedAt,
      isGroup: true
    };

    console.log('Returning group conversation:', conversation);
    res.json([conversation]);
  } catch (error) {
    console.error('Get group conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's conversations (list of people they can message)
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

// Get messages for conversation
// Get messages for a group
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

// Socket.io authentication middleware
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

// Socket.io connection handling
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

// Database migrations and sample data initialization
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

// Run migrations and initialize sample data after database connection
runMigrations().then(() => {
  initializeSampleData();
});

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
