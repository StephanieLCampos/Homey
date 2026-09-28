/**
 * ORPHANED GROUP-MATCH CHECK AND REPAIR (maintenance utility)
 *
 * Detects one specific corrupt state: a GroupMatch marked 'accepted' whose user
 * was never actually added to the group and is still an individual. That
 * combination was produced by an earlier version of the accept endpoint which
 * marked the invitation accepted before completing the join, and it left the
 * user permanently unable to see the invitation again.
 *
 * When the pattern is found, the invitation is reset to 'pending' so it can be
 * accepted properly. This is a write, not a read-only diagnostic.
 *
 * Usage: run from the server/ directory - `node check_alex_groupmatch.js`
 *
 * Connections:
 *   - server/models/GroupMatch.js, Group.js, User.js
 *   - server/detect_and_fix_orphaned_group_matches.js - the general form of this
 *     repair, which sweeps every accepted invitation rather than one id.
 *
 * Note: the user and GroupMatch ids are hard-coded from one historic session.
 * Superseded by the sweep script above; listed in the dead-file audit.
 */
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