const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
const UserGroupHistory = require('./models/UserGroupHistory');
const SwipeAction = require('./models/SwipeAction');
const Match = require('./models/Match');
const Message = require('./models/Message');
require('dotenv').config();

async function testAlexAccept() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const groupMatchId = '692e48495642451b495f6f87';
    const userId = '692e47735642451b495f6ebf'; // Alex's ID
    
    console.log('=== TESTING ALEX ACCEPT GROUP MATCH ===');
    console.log('GroupMatchId:', groupMatchId);
    console.log('UserId:', userId);
    
    // Step 1: Find the GroupMatch
    console.log('Step 1: Finding GroupMatch...');
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    if (!groupMatch) {
      throw new Error('Group match not found');
    }
    console.log('✓ GroupMatch found');
    
    // Step 2: Validation checks
    console.log('Step 2: Running validation checks...');
    
    // Check user authorization
    if (groupMatch.userId.toString() !== userId) {
      throw new Error('Access denied - user mismatch');
    }
    console.log('✓ User authorization passed');
    
    // Check group match status
    if (groupMatch.status !== 'pending') {
      throw new Error(`Group match is not pending, current status: ${groupMatch.status}`);
    }
    console.log('✓ Group match status is pending');
    
    // Check group availability
    const group = groupMatch.groupId;
    if (!group || !group.isActive || !group.canAddMember()) {
      throw new Error('Group is no longer available or full');
    }
    console.log('✓ Group is available and can accept members');
    
    // Check user status
    const user = await User.findById(userId);
    if (!user || user.status !== 'individual') {
      throw new Error(`User cannot join groups - status: ${user?.status}`);
    }
    console.log('✓ User can join groups');
    
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
    console.log('✓ History record created');
    
    // Step 5: Delete user's data
    console.log('Step 5: Deleting user data...');
    await SwipeAction.deleteMany({ 
      $or: [
        { userId: userId },
        { targetUserId: userId }
      ]
    });
    await Match.deleteMany({
      $or: [
        { userId1: userId, status: { $in: ['pending', 'accepted'] } },
        { userId2: userId, status: { $in: ['pending', 'accepted'] } }
      ]
    });
    console.log('✓ User data deleted');
    
    // Step 6: Add user to group
    console.log('Step 6: Adding user to group...');
    const addResult = group.addMember(userId);
    console.log('Add member result:', addResult);
    if (!addResult) {
      throw new Error('Failed to add user to group');
    }
    await group.save();
    console.log('✓ Group saved');
    
    // Step 7: Update user status
    console.log('Step 7: Updating user status...');
    await User.findByIdAndUpdate(userId, {
      status: 'in_group',
      profileStatus: 'paused',
      groupId: group._id
    });
    console.log('✓ User status updated');
    
    // Step 8: Update group match status
    console.log('Step 8: Updating group match status...');
    groupMatch.status = 'accepted';
    await groupMatch.save();
    console.log('✓ Group match status updated');
    
    // Step 9: Delete other pending group matches
    console.log('Step 9: Deleting other pending group matches...');
    const deleteResult = await GroupMatch.deleteMany({
      userId: userId,
      _id: { $ne: groupMatch._id },
      status: 'pending'
    });
    console.log('Deleted group matches:', deleteResult.deletedCount);
    
    // Step 10: Add system message
    console.log('Step 10: Adding system message...');
    const systemMessage = new Message({
      senderId: null,
      groupId: group._id,
      content: `${user.name} has joined the group chat`,
      messageType: 'system'
    });
    await systemMessage.save();
    console.log('✓ System message added');
    
    console.log('🎉 Alex accept operation completed successfully!');
    mongoose.disconnect();
    
  } catch(e) { 
    console.error('❌ Error during Alex accept operation:');
    console.error('Error name:', e.name);
    console.error('Error message:', e.message);
    console.error('Error stack:', e.stack);
    mongoose.disconnect(); 
  }
}

testAlexAccept();