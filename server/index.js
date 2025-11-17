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

const User = require('./models/User');
const Group = require('./models/Group');
const Match = require('./models/Match');
const SwipeAction = require('./models/SwipeAction');
const Message = require('./models/Message');
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
    
    // Find potential matches - exclude current user, inactive users, grouped users, swiped users, and matched users
    const potentialMatches = await User.find({ 
      _id: { 
        $ne: req.params.id,
        $nin: excludedUserIds  // Exclude swiped and matched users
      }, 
      isActive: true,
      $or: [
        { groupId: { $exists: false } },
        { groupId: null }
      ]
    });
    console.log('Found potential matches:', potentialMatches.length);
    console.log('User names:', potentialMatches.map(u => u.name));

    // For now, show all potential matches (not just compatible ones)
    // You can uncomment the compatibility filter below if needed:
    // const compatibleMatches = potentialMatches.filter(user => 
    //   currentUser.isCompatibleWith(user)
    // );

    const result = potentialMatches.map(user => user.toSafeObject());
    console.log('Returning:', result.length, 'matches');
    res.json(result);
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
    if (req.userId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get actual matches (mutual likes)
    const userMatches = await Match.find({
      $or: [
        { userId1: req.params.id },
        { userId2: req.params.id }
      ]
    }).populate('userId1 userId2', '-password');
    
    // Get incoming likes (people who swiped right on this user but haven't been matched yet)
    const incomingLikes = await SwipeAction.find({
      targetUserId: req.params.id,
      action: { $in: ['like', 'superlike'] }
    }).populate('userId', '-password');
    
    // Create pending match objects for incoming likes that aren't already matches
    const pendingMatches = incomingLikes
      .filter(like => !userMatches.some(match => 
        (match.userId1._id.toString() === like.userId._id.toString()) ||
        (match.userId2._id.toString() === like.userId._id.toString())
      ))
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
    
    // Combine real matches and pending matches
    const allMatches = [...userMatches, ...pendingMatches];
    
    console.log('Returning matches for user:', req.params.id);
    console.log('Real matches:', userMatches.length);
    console.log('Pending matches:', pendingMatches.length);
    
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
    
    // Update member users
    await User.updateMany(
      { _id: { $in: memberIds } },
      { 
        groupId: group._id,
        status: 'in_group',
        isActive: false
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
          isActive: false
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
    
    // Delete the match
    await Match.findByIdAndDelete(req.params.matchId);
    
    // Also delete any messages between these users
    const userId1 = match.userId1.toString();
    const userId2 = match.userId2.toString();
    await Message.deleteMany({
      $or: [
        { senderId: userId1, receiverId: userId2 },
        { senderId: userId2, receiverId: userId1 }
      ],
      groupId: null
    });
    
    console.log('Match deleted:', req.params.matchId);
    res.json({ success: true, message: 'Successfully unmatched' });
  } catch (error) {
    console.error('Unmatch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's conversations (list of people they can message)
app.get('/api/conversations', authMiddleware, async (req, res) => {
  try {
    // Get all matches for the user where both users have swiped right and status is accepted
    const userMatches = await Match.find({
      $or: [
        { userId1: req.userId },
        { userId2: req.userId }
      ],
      status: 'accepted' // Both users liked each other and match is accepted
    }).populate('userId1 userId2', 'name photos email');
    
    // Format conversations with the other user's info
    const conversations = userMatches.map(match => {
      const otherUser = match.userId1._id.toString() === req.userId ? match.userId2 : match.userId1;
      
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
    });
    
    console.log('Returning conversations for user:', req.userId, conversations.length);
    res.json(conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages for conversation
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
      if (!userIds.includes(req.userId)) {
        return res.status(403).json({ error: 'Access denied to conversation' });
      }
      console.log('Creating ObjectId query for userIds:', userIds);
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
    
    if (!user || !user.isActive) {
      return next(new Error('Authentication error: Invalid token or inactive user'));
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

// Initialize sample data after database connection
initializeSampleData();

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
