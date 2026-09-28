/**
 * ORPHANED GROUP-MATCH SWEEP AND REPAIR (destructive maintenance utility)
 *
 * Scans every GroupMatch marked 'accepted' and repairs those where the
 * acceptance never completed - the user is absent from the group's member list,
 * or their own status and groupId do not agree with it.
 *
 * This is the state an earlier version of the accept endpoint could leave behind
 * when a later step failed after the invitation had already been marked
 * accepted; the affected user could then neither join the group nor see the
 * invitation again. Each such record is reset to 'pending' so the accept can be
 * retried. The current endpoint marks the invitation accepted last, which
 * prevents new occurrences.
 *
 * Usage: run from the server/ directory
 *        `node detect_and_fix_orphaned_group_matches.js`
 *
 * Connections:
 *   - server/models/GroupMatch.js, Group.js, User.js
 *   - server/index.js - the accept endpoint whose ordering now prevents this.
 *   - server/check_alex_groupmatch.js, server/fix_alex_group_issue.js - the
 *     single-record predecessors of this sweep.
 *
 * Note: this is the general, id-independent version and is the one to keep of
 * the three.
 */
const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function detectAndFixOrphanedGroupMatches() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    console.log('=== DETECTING ORPHANED GROUP MATCHES ===');
    console.log('Looking for GroupMatch records with status="accepted" where user is not actually in the group...');
    
    // Find all accepted GroupMatch records
    const acceptedGroupMatches = await GroupMatch.find({ 
      status: 'accepted' 
    }).populate('groupId userId');
    
    console.log(`Found ${acceptedGroupMatches.length} accepted GroupMatch records`);
    
    let fixedCount = 0;
    const orphanedMatches = [];
    
    for (const groupMatch of acceptedGroupMatches) {
      const user = groupMatch.userId;
      const group = groupMatch.groupId;
      
      if (!user || !group) {
        console.log(`⚠️  GroupMatch ${groupMatch._id} has missing user or group`);
        continue;
      }
      
      // Two independent consistency checks: the group must list the user, and
      // the user's own status and groupId must agree. Either failing means the
      // acceptance was recorded but never completed.
      const userInGroup = group.memberIds.some(memberId => 
        memberId.toString() === user._id.toString()
      );
      
      // Check if user status is consistent
      const userStatusCorrect = user.status === 'in_group' && 
                                user.groupId?.toString() === group._id.toString();
      
      if (!userInGroup || !userStatusCorrect) {
        orphanedMatches.push({
          groupMatchId: groupMatch._id,
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          userStatus: user.status,
          userGroupId: user.groupId?.toString(),
          groupId: group._id,
          groupName: group.name,
          userInGroup,
          userStatusCorrect
        });
      }
    }
    
    console.log(`\\n🔍 Found ${orphanedMatches.length} orphaned GroupMatch records:`);
    
    for (const orphaned of orphanedMatches) {
      console.log(`\\n📋 Orphaned GroupMatch ${orphaned.groupMatchId}:`);
      console.log(`   User: ${orphaned.userName} (${orphaned.userEmail})`);
      console.log(`   User Status: ${orphaned.userStatus}, GroupId: ${orphaned.userGroupId}`);
      console.log(`   Target Group: ${orphaned.groupName} (${orphaned.groupId})`);
      console.log(`   User in group: ${orphaned.userInGroup}`);
      console.log(`   User status correct: ${orphaned.userStatusCorrect}`);
      
      // Fix by resetting to pending
      console.log('   🔧 Resetting GroupMatch status to pending...');
      await GroupMatch.findByIdAndUpdate(orphaned.groupMatchId, { status: 'pending' });
      fixedCount++;
      console.log('   ✅ Fixed');
    }
    
    console.log(`\\n🎯 SUMMARY:`);
    console.log(`   Checked: ${acceptedGroupMatches.length} accepted GroupMatch records`);
    console.log(`   Found orphaned: ${orphanedMatches.length}`);
    console.log(`   Fixed: ${fixedCount}`);
    
    if (fixedCount > 0) {
      console.log('\\n✨ Users with fixed GroupMatch records should now see their group invitations again!');
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

detectAndFixOrphanedGroupMatches();