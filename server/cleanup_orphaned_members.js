/**
 * ORPHANED GROUP MEMBER CLEANUP (destructive maintenance utility)
 *
 * Removes member ids from every group where the referenced user account no
 * longer exists, then recomputes that group's `target_status` and `group_status`.
 *
 * This matters beyond tidiness: a group whose member list is padded with deleted
 * accounts reads as full, which pauses it and silently stops it from ever
 * swiping again. The group swipe endpoint now performs the same reconciliation
 * inline; this script repairs groups that were already affected.
 *
 * Usage: run from the server/ directory - `node cleanup_orphaned_members.js`
 *
 * Connections:
 *   - server/models/User.js, Group.js
 *   - server/index.js - the inline reconciliation in the group swipe endpoint.
 *   - server/debug_all_users.js - the read-only detector for this condition.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
require('dotenv').config();

async function cleanupOrphanedMembers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const groups = await Group.find({});
    console.log(`Checking ${groups.length} groups for orphaned members...`);
    
    let totalCleaned = 0;
    
    for (const group of groups) {
      const originalMemberCount = group.memberIds.length;
      const validMembers = [];
      
      for (const memberId of group.memberIds) {
        const member = await User.findById(memberId);
        if (member) {
          validMembers.push(memberId);
        } else {
          console.log(`Found orphaned member ${memberId} in group ${group.name}`);
          totalCleaned++;
        }
      }
      
      if (validMembers.length !== originalMemberCount) {
        group.memberIds = validMembers;
        
        // Update group status based on new member count
        group.target_status = group.memberIds.length >= group.maxMembers ? 'full' : 'not_full';
        group.group_status = group.target_status === 'full' ? 'paused' : 'active';
        
        await group.save();
        
        console.log(`Cleaned group ${group.name}: ${originalMemberCount} -> ${validMembers.length} members`);
        console.log(`Updated target_status to: ${group.target_status}`);
        console.log(`Updated group_status to: ${group.group_status}`);
        console.log(`Can send likes: ${group.canSendLikes()}`);
      }
    }
    
    console.log(`\\nCleanup complete: Removed ${totalCleaned} orphaned member references`);
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

cleanupOrphanedMembers();