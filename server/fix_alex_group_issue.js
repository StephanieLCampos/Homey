const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function fixAlexGroupMatch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const alexId = '692e51af6011699307bf1b00';
    const groupMatchId = '692e52696011699307bf1d7f';
    
    console.log('=== FIXING ALEX GROUP MATCH ISSUE ===');
    
    // Get the problematic GroupMatch
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    console.log('Current GroupMatch status:', groupMatch.status);
    console.log('Group name:', groupMatch.groupId?.name);
    
    // Check if Alex is actually in the group
    const group = groupMatch.groupId;
    const alexInGroup = group.memberIds.includes(alexId);
    console.log('Is Alex actually in the group?', alexInGroup);
    
    // Check Alex's current status
    const alex = await User.findById(alexId);
    console.log('Alex current status:', alex.status);
    console.log('Alex groupId:', alex.groupId);
    
    if (groupMatch.status === 'accepted' && !alexInGroup && alex.status === 'individual') {
      console.log('');
      console.log('🔧 FIXING: Resetting corrupted GroupMatch to pending so Alex can try to join again...');
      
      groupMatch.status = 'pending';
      await groupMatch.save();
      
      console.log('✅ GroupMatch reset to pending. Alex should now see the invitation again.');
    } else {
      console.log('');
      console.log('❌ No fix needed or different issue detected.');
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

fixAlexGroupMatch();