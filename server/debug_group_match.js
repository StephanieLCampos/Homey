/**
 * SINGLE GROUP-MATCH INSPECTOR (diagnostic utility)
 *
 * Read-only. Prints one GroupMatch document with its group's capacity flags and
 * the target user's current status - the minimum needed to decide whether an
 * invitation is still actionable.
 *
 * Usage: run from the server/ directory - `node debug_group_match.js`
 *
 * Connections:
 *   - server/models/GroupMatch.js, Group.js, User.js
 *
 * Note: the GroupMatch id is hard-coded and no longer resolves. Listed in the
 * dead-file audit.
 */
const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugGroupMatch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const groupMatchId = '692e40c80887ac5769edfb68';
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    
    if (!groupMatch) {
      console.log('GroupMatch not found');
      mongoose.disconnect();
      return;
    }
    
    console.log('GroupMatch Details:');
    console.log('- ID:', groupMatch._id);
    console.log('- UserId:', groupMatch.userId);
    console.log('- GroupId:', groupMatch.groupId?._id);
    console.log('- Status:', groupMatch.status);
    console.log('- Group exists:', !!groupMatch.groupId);
    
    if (groupMatch.groupId) {
      console.log('- Group name:', groupMatch.groupId.name);
      console.log('- Group active:', groupMatch.groupId.isActive);
      console.log('- Group members:', groupMatch.groupId.memberIds?.length);
      console.log('- Group max members:', groupMatch.groupId.maxMembers);
      console.log('- Can add member:', groupMatch.groupId.canAddMember());
    }
    
    const user = await User.findById(groupMatch.userId);
    if (user) {
      console.log('\nUser Details:');
      console.log('- Name:', user.name);
      console.log('- Status:', user.status);
      console.log('- Current GroupId:', user.groupId);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugGroupMatch();