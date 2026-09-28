/**
 * PENDING GROUP INVITATION DUMP (diagnostic utility)
 *
 * Read-only. Looks up a user by email and prints their status plus every pending
 * group invitation addressed to them, with each group's capacity flags. Written
 * to investigate invitations that were not appearing in the UI.
 *
 * Usage: run from the server/ directory - `node debug_alex_group.js`
 *        Requires MongoDB to be running; see the README for how to start it.
 *
 * Connections:
 *   - server/models/GroupMatch.js, Group.js, User.js
 *
 * Notes:
 *   - The target address, alex@example.com, is recreated by
 *     initializeSampleData() in server/index.js on every server start, so this
 *     part of the script works against any database.
 *   - The `Group` import is load-bearing even though the name is never used
 *     directly: `.populate('groupId')` resolves GroupMatch's `ref: 'Group'`, and
 *     Mongoose can only do that if the Group model has been registered by being
 *     required. Removing it raises MissingSchemaError once a connection is open.
 *   - Also hard-codes a group named 'BING' from a historic local database; that
 *     block is skipped without error anywhere else. Listed in the dead-file audit.
 */
const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugAlexGroup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find alex@example.com user
    const alex = await User.findOne({ email: 'alex@example.com' });
    console.log('Alex user found:', !!alex);
    if (!alex) {
      console.log('ERROR: Alex user not found');
      mongoose.disconnect();
      return;
    }
    
    console.log('Alex details:', {
      _id: alex._id,
      name: alex.name,
      email: alex.email,
      status: alex.status,
      groupId: alex.groupId,
      profileStatus: alex.profileStatus
    });
    
    // Find pending group matches for Alex
    const alexGroupMatches = await GroupMatch.find({ 
      userId: alex._id,
      status: 'pending'
    }).populate('groupId');
    
    console.log(`Found ${alexGroupMatches.length} pending group matches for Alex:`);
    
    for (const match of alexGroupMatches) {
      console.log('- GroupMatch ID:', match._id);
      console.log('  Group ID:', match.groupId?._id);
      console.log('  Group Name:', match.groupId?.name);
      console.log('  Status:', match.status);
      console.log('  Group Active:', match.groupId?.isActive);
      console.log('  Group Members:', match.groupId?.memberIds?.length);
      console.log('  Group Max Members:', match.groupId?.maxMembers);
      console.log('  Can Add Member:', match.groupId?.canAddMember());
      console.log('  ---');
    }
    
    // Check BING group specifically
    const bingGroup = await Group.findOne({ name: 'BING' });
    if (bingGroup) {
      console.log('\\nBING Group Details:');
      console.log('- ID:', bingGroup._id);
      console.log('- Name:', bingGroup.name);
      console.log('- Active:', bingGroup.isActive);
      console.log('- Members:', bingGroup.memberIds?.length);
      console.log('- Max Members:', bingGroup.maxMembers);
      console.log('- Can Add Member:', bingGroup.canAddMember());
      console.log('- Member IDs:', bingGroup.memberIds);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugAlexGroup();