const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugGroupInvites() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const targetUserId = '692e4cb5b1472bb16e01c961'; // Alex's new ID
    const groupMatchId = '692e4e31b1472bb16e01ccf1'; // From console output
    
    console.log('=== DEBUG GROUP INVITES ===');
    console.log('Target User ID:', targetUserId);
    console.log('Group Match ID:', groupMatchId);
    
    // Check if the specific GroupMatch exists
    const specificGroupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    if (specificGroupMatch) {
      console.log('\nSpecific GroupMatch found:', {
        _id: specificGroupMatch._id,
        userId: specificGroupMatch.userId,
        groupId: specificGroupMatch.groupId?._id,
        groupName: specificGroupMatch.groupId?.name,
        status: specificGroupMatch.status,
        createdAt: specificGroupMatch.createdAt
      });
    } else {
      console.log('\nSpecific GroupMatch NOT FOUND');
    }
    
    // Find all pending group matches for the target user
    const userGroupMatches = await GroupMatch.find({ 
      userId: targetUserId,
      status: 'pending'
    }).populate('groupId');
    
    console.log(`\nFound ${userGroupMatches.length} pending group matches for user ${targetUserId}:`);
    
    for (const match of userGroupMatches) {
      console.log(`- GroupMatch ID: ${match._id}`);
      console.log(`  Group: ${match.groupId?.name || 'NO GROUP'}`);
      console.log(`  Status: ${match.status}`);
      console.log(`  Created: ${match.createdAt}`);
      console.log('  ---');
    }
    
    // Check the target user details
    const targetUser = await User.findById(targetUserId);
    if (targetUser) {
      console.log('\nTarget User Details:');
      console.log('- Name:', targetUser.name);
      console.log('- Email:', targetUser.email);
      console.log('- Status:', targetUser.status);
      console.log('- Group ID:', targetUser.groupId);
    } else {
      console.log('\nTarget User NOT FOUND');
    }
    
    // Check the BING group
    const bingGroup = await Group.findOne({ name: 'BING' });
    if (bingGroup) {
      console.log('\nBING Group Details:');
      console.log('- ID:', bingGroup._id);
      console.log('- Members:', bingGroup.memberIds?.length);
      console.log('- Max Members:', bingGroup.maxMembers);
      console.log('- Can Add Member:', bingGroup.canAddMember());
      console.log('- Active:', bingGroup.isActive);
      console.log('- Status:', bingGroup.group_status);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugGroupInvites();