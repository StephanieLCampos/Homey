/**
 * USER STATUS REPAIR (maintenance utility)
 *
 * Reconciles one user's lifecycle fields against actual group membership, which
 * can fall out of step when a join or leave fails part-way through.
 *
 * Two directions are handled:
 *   - Marked 'in_group' but in no active group: reset to an active individual
 *     with no groupId, and promote their 'group'-status matches back to
 *     'accepted' so those conversations reappear in the individual matches list.
 *   - Genuinely in a group but not marked as such: set 'in_group' / 'paused' and
 *     point groupId at the first group found.
 *
 * Usage: run from the repository root
 *        `node fix_user_status.js <user-email>`
 *
 * Connections:
 *   - server/models/User.js, Group.js, Match.js
 *   - debug_user_status.js  - the read-only diagnosis for this repair.
 *   - server/fix_group_sync.js - the database-wide equivalent.
 *
 * Notes:
 *   - Writes to the user and to matches; make sure the diagnosis is right first.
 *   - Hard-codes the `roommate-finder` database rather than the server's
 *     `homey_roommate_app` - see the audit note on database naming.
 */
// Fix script to ensure user status is consistent after leaving group
// Run this in the server directory: node ../fix_user_status.js <user-email>

const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function fixUserStatus(userEmail) {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log('User not found:', userEmail);
      return;
    }

    console.log('\nChecking user:', user.name);
    console.log('Current status:', user.status);
    console.log('Current profileStatus:', user.profileStatus);
    console.log('Current isActive:', user.isActive);
    console.log('Current groupId:', user.groupId);

    // Check if user is actually in any groups
    const activeGroups = await Group.find({
      memberIds: user._id,
      isActive: true
    });

    console.log('\nActive groups containing user:', activeGroups.length);

    // Case 1: the user believes they are in a group, but no active group lists
    // them. Release them back to an individual and promote the matches that were
    // re-pointed at the group back to 'accepted', so those conversations
    // reappear in their individual matches list.
    if (activeGroups.length === 0 && (user.status === 'in_group' || user.groupId)) {
      console.log('\nFIXING: User marked as in group but no active groups found');
      
      // Fix user status
      user.status = 'individual';
      user.profileStatus = 'active';
      user.isActive = true;
      user.groupId = null;
      
      await user.save();
      
      console.log('User status fixed!');
      console.log('New status:', user.status);
      console.log('New profileStatus:', user.profileStatus);
      console.log('New isActive:', user.isActive);

      // Also update any group-type matches to accepted
      const groupMatches = await Match.find({
        $or: [
          { userId1: user._id },
          { userId2: user._id }
        ],
        status: 'group'
      });

      console.log('\nFound', groupMatches.length, 'group-type matches to fix');
      
      for (const match of groupMatches) {
        match.status = 'accepted';
        await match.save();
        console.log('Fixed match:', match._id);
      }
    // Case 2: the user is genuinely a member of a group but is not marked as
    // one. Bring their status fields into line with the membership.
    } else if (activeGroups.length > 0) {
      console.log('\nUser is correctly in', activeGroups.length, 'active group(s)');
      
      // Ensure user status is correct
      if (user.status !== 'in_group' || user.profileStatus !== 'paused') {
        user.status = 'in_group';
        user.profileStatus = 'paused';
        user.groupId = activeGroups[0]._id;
        await user.save();
        console.log('Fixed user status to match group membership');
      }
    } else {
      console.log('\nUser status appears correct - no fixes needed');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.log('Usage: node fix_user_status.js <user-email>');
  console.log('This will fix user status inconsistencies after leaving a group');
  process.exit(1);
}

fixUserStatus(email);