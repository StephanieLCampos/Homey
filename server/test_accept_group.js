const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
const UserGroupHistory = require('./models/UserGroupHistory');
const SwipeAction = require('./models/SwipeAction');
const Match = require('./models/Match');
const Message = require('./models/Message');
require('dotenv').config();

async function testAcceptGroup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const groupMatchId = '692e40d20887ac5769edfb77';
    const userId = '691e3bcac5eb1a469363d74b';
    
    console.log('=== TESTING ACCEPT GROUP MATCH ===');
    console.log('GroupMatchId:', groupMatchId);
    console.log('UserId:', userId);
    
    // Step 1: Find the GroupMatch
    console.log('Step 1: Finding GroupMatch...');
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    if (!groupMatch) {
      throw new Error('Group match not found');
    }
    console.log('✓ GroupMatch found');
    
    // Step 2: Get user data  
    console.log('Step 2: Getting user data...');
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    console.log('✓ User found:', user.name);
    
    // Step 3: Get user's current data
    console.log('Step 3: Getting user current data...');
    const userSwipeActions = await SwipeAction.find({ userId: userId });
    const userMatches = await Match.find({
      $or: [
        { userId1: userId, status: { $in: ['pending', 'accepted'] } },
        { userId2: userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });
    console.log('✓ Found', userSwipeActions.length, 'swipes and', userMatches.length, 'matches');
    
    // Step 4: Create history record
    console.log('Step 4: Creating history record...');
    const groupHistory = new UserGroupHistory({
      userId: userId,
      groupId: groupMatch.groupId._id,
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
    console.log('✓ History record created');
    
    // Step 5: Add user to group
    console.log('Step 5: Adding user to group...');
    const group = groupMatch.groupId;
    const addResult = group.addMember(userId);
    console.log('Add member result:', addResult);
    await group.save();
    console.log('✓ Group saved');
    
    // Step 6: Update user status
    console.log('Step 6: Updating user status...');
    await User.findByIdAndUpdate(userId, {
      status: 'in_group',
      profileStatus: 'paused',
      groupId: group._id
    });
    console.log('✓ User status updated');
    
    // Step 7: Update group match status
    console.log('Step 7: Updating group match status...');
    groupMatch.status = 'accepted';
    await groupMatch.save();
    console.log('✓ Group match status updated');
    
    // Step 8: Add system message
    console.log('Step 8: Adding system message...');
    const systemMessage = new Message({
      senderId: null,
      groupId: group._id,
      content: `${user.name} has joined the group chat`,
      messageType: 'system'
    });
    await systemMessage.save();
    console.log('✓ System message added');
    
    console.log('🎉 Accept operation completed successfully!');
    mongoose.disconnect();
    
  } catch(e) { 
    console.error('❌ Error during accept operation:');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack);
    mongoose.disconnect(); 
  }
}

testAcceptGroup();