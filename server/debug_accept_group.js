/**
 * GROUP-MATCH ACCEPT PRECONDITION DUMP (diagnostic utility)
 *
 * Read-only. Walks the same preconditions as POST /api/group-matches/:id/accept
 * - invitation exists, caller is its target, invitation is pending, group has
 * room, user is still an individual - and prints the outcome of each, so a
 * failing accept can be attributed to a specific check.
 *
 * Usage: run from the server/ directory - `node debug_accept_group.js`
 *
 * Connections:
 *   - server/models/GroupMatch.js, Group.js, User.js
 *   - server/index.js - the endpoint whose logic this mirrors.
 *
 * Note: the GroupMatch and user ids are hard-coded from one historic debugging
 * session and no longer resolve. Listed in the dead-file audit.
 */
const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugAcceptGroup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const groupMatchId = '692e40d20887ac5769edfb77';
    const userId = '691e3bcac5eb1a469363d74b';
    
    console.log('=== DEBUG ACCEPT GROUP MATCH ===');
    console.log('GroupMatchId:', groupMatchId);
    console.log('UserId:', userId);
    
    // Check if GroupMatch exists
    const groupMatch = await GroupMatch.findById(groupMatchId).populate('groupId');
    console.log('GroupMatch found:', !!groupMatch);
    
    if (!groupMatch) {
      console.log('ERROR: Group match not found');
      mongoose.disconnect();
      return;
    }
    
    console.log('GroupMatch details:', {
      _id: groupMatch._id,
      userId: groupMatch.userId,
      groupId: groupMatch.groupId?._id,
      status: groupMatch.status
    });
    
    // Check user authorization
    console.log('User authorization check:', {
      groupMatchUserId: groupMatch.userId.toString(),
      requestUserId: userId,
      match: groupMatch.userId.toString() === userId
    });
    
    // Check group status
    const group = groupMatch.groupId;
    if (group) {
      console.log('Group details:', {
        exists: !!group,
        isActive: group.isActive,
        canAddMember: group.canAddMember(),
        currentMembers: group.memberIds?.length,
        maxMembers: group.maxMembers,
        memberIds: group.memberIds
      });
    }
    
    // Check user status
    const user = await User.findById(userId);
    console.log('User details:', {
      exists: !!user,
      status: user?.status,
      currentGroupId: user?.groupId,
      name: user?.name
    });
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugAcceptGroup();