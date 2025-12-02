const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function checkAlexGroupMatch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const alexUserId = '692e4cb5b1472bb16e01c961';
    const groupMatchId = '692e4e31b1472bb16e01ccf1';
    
    console.log('=== CHECKING ALEX GROUP MATCH STATUS ===');
    
    // Get the GroupMatch
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    console.log('GroupMatch details:', {
      _id: groupMatch._id,
      userId: groupMatch.userId,
      groupId: groupMatch.groupId._id,
      status: groupMatch.status,
      createdAt: groupMatch.createdAt
    });
    
    // Check if Alex is in the group
    const group = groupMatch.groupId;
    const alexInGroup = group.memberIds.includes(alexUserId);
    console.log('Is Alex in the group?', alexInGroup);
    
    // Check Alex's user status
    const alex = await User.findById(alexUserId);
    console.log('Alex user status:', {
      name: alex.name,
      status: alex.status,
      groupId: alex.groupId,
      profileStatus: alex.profileStatus
    });
    
    // This indicates the GroupMatch was accepted but Alex was never added to the group
    // Let's check if we can figure out what went wrong
    
    if (groupMatch.status === 'accepted' && !alexInGroup && alex.status === 'individual') {
      console.log('\n❌ PROBLEM DETECTED:');
      console.log('- GroupMatch status: accepted');
      console.log('- User not in group: true');
      console.log('- User status: individual');
      console.log('- This suggests the accept process failed after marking the GroupMatch as accepted');
      
      // Let's reset this GroupMatch to pending so it can be properly processed
      console.log('\n🔧 Resetting GroupMatch to pending status...');
      groupMatch.status = 'pending';
      await groupMatch.save();
      console.log('✅ GroupMatch reset to pending');
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

checkAlexGroupMatch();