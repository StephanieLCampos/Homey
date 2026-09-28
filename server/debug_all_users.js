/**
 * GROUP MEMBERSHIP AUDIT SCRIPT (diagnostic utility)
 *
 * Read-only. Lists every user whose status is 'in_group' with their groupId,
 * then dumps a specific group's capacity flags and resolves each of its member
 * ids, printing 'USER NOT FOUND' for members whose accounts have been deleted.
 * Written to investigate groups that had become unable to send likes because
 * deleted accounts were still inflating the member count.
 *
 * Usage: run from the server/ directory - `node debug_all_users.js`
 *        Requires MongoDB to be running; see the README for how to start it.
 *
 * Connections:
 *   - server/models/User.js, Group.js
 *   - server/cleanup_orphaned_members.js - the fix for what this detects.
 *
 * Note: hard-codes a group named 'BING' from a historic local database, so the
 * second half produces no output elsewhere - `findOne` returns null and the
 * `if (bingGroup)` block is skipped without error. The first half (users in
 * groups) is generic and works against any database. Listed in the dead-file
 * audit.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
require('dotenv').config();

async function debugAllUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all users with status in_group
    const usersInGroups = await User.find({ status: 'in_group' });
    console.log(`Found ${usersInGroups.length} users in groups:`);
    
    for (const user of usersInGroups) {
      console.log(`- ${user.name} (${user.email}): groupId=${user.groupId}`);
    }
    
    // Check the BING group specifically
    const bingGroup = await Group.findOne({ name: 'BING' });
    if (bingGroup) {
      console.log('\nBING Group Details:');
      console.log('- ID:', bingGroup._id);
      console.log('- Members count:', bingGroup.memberIds?.length);
      console.log('- Max Members:', bingGroup.maxMembers);
      console.log('- Target Status:', bingGroup.target_status);
      console.log('- Can Send Likes:', bingGroup.canSendLikes());
      
      // Check each member
      console.log('\nBING Group Members:');
      for (let i = 0; i < bingGroup.memberIds.length; i++) {
        const memberId = bingGroup.memberIds[i];
        const member = await User.findById(memberId);
        console.log(`${i + 1}. ${memberId} - ${member ? member.name + ' (' + member.email + ')' : 'USER NOT FOUND'}`);
      }
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugAllUsers();