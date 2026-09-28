/**
 * FULL DATA RESET (destructive maintenance utility)
 *
 * Returns the application to a clean slate while preserving accounts. It deletes
 * every group, match, message, swipe action, group request, join request, group
 * match and history record, then resets each user to an active individual with
 * no group.
 *
 * User documents are deliberately kept, so existing logins continue to work and
 * email addresses stay reserved - the intent is a fresh start for matching, not
 * an empty database.
 *
 * Unlike most scripts here it prompts for confirmation, requiring the literal
 * string YES before doing anything.
 *
 * Usage: run from the repository root - `node reset_all_users.js`
 *
 * Connections:
 *   - server/models/* - all eight collections are cleared.
 *   - verify_reset.js - the verification counterpart (note the database-name
 *     mismatch described in that file's header).
 *   - server/seed.js  - repopulates demonstration users afterwards.
 *   - server/index.js - POST /api/admin/reset-all is the in-process equivalent.
 *
 * Notes:
 *   - Destructive and irreversible.
 *   - Users are saved individually rather than with `updateMany` so the model's
 *     pre-save hooks run.
 *   - Targets the `homey_roommate_app` database, matching server/.env.
 */
// Reset script to clear all matches, groups, and interactions
// Run this in the server directory: node ../reset_all_users.js
// WARNING: This will delete all matches, groups, messages, and swipe actions!

const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function resetAllUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/homey_roommate_app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to database');
    console.log('\n⚠️  WARNING: This will reset ALL users to a fresh state!');
    console.log('This includes deleting:');
    console.log('- All matches');
    console.log('- All groups');
    console.log('- All messages');
    console.log('- All swipe actions');
    console.log('- All group join requests');
    console.log('- All group requests');
    console.log('- All group matches');
    console.log('- All user group histories');
    console.log('\nUsers and their profiles will be preserved but reset to individual status.\n');

    // Require an exact, case-sensitive YES. This is the only guard on an
    // irreversible operation, so a bare Enter or a lowercase 'yes' cancels.
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question('Are you sure you want to continue? Type YES to confirm: ', resolve);
    });
    readline.close();

    if (answer !== 'YES') {
      console.log('Operation cancelled');
      mongoose.connection.close();
      return;
    }

    console.log('\nStarting reset process...\n');

    // Load models
    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const Message = require(path.join(__dirname, 'server', 'models', 'Message'));
    const SwipeAction = require(path.join(__dirname, 'server', 'models', 'SwipeAction'));
    const GroupJoinRequest = require(path.join(__dirname, 'server', 'models', 'GroupJoinRequest'));
    const GroupRequest = require(path.join(__dirname, 'server', 'models', 'GroupRequest'));
    const GroupMatch = require(path.join(__dirname, 'server', 'models', 'GroupMatch'));
    const UserGroupHistory = require(path.join(__dirname, 'server', 'models', 'UserGroupHistory'));

    // 1. Delete all groups
    const groupCount = await Group.countDocuments();
    await Group.deleteMany({});
    console.log(`✓ Deleted ${groupCount} groups`);

    // 2. Delete all matches
    const matchCount = await Match.countDocuments();
    await Match.deleteMany({});
    console.log(`✓ Deleted ${matchCount} matches`);

    // 3. Delete all messages
    const messageCount = await Message.countDocuments();
    await Message.deleteMany({});
    console.log(`✓ Deleted ${messageCount} messages`);

    // 4. Delete all swipe actions
    const swipeCount = await SwipeAction.countDocuments();
    await SwipeAction.deleteMany({});
    console.log(`✓ Deleted ${swipeCount} swipe actions`);

    // 5. Delete all group join requests
    const joinRequestCount = await GroupJoinRequest.countDocuments();
    await GroupJoinRequest.deleteMany({});
    console.log(`✓ Deleted ${joinRequestCount} group join requests`);

    // 5a. Delete all group requests
    const groupRequestCount = await GroupRequest.countDocuments();
    await GroupRequest.deleteMany({});
    console.log(`✓ Deleted ${groupRequestCount} group requests`);

    // 6. Delete all group matches
    const groupMatchCount = await GroupMatch.countDocuments();
    await GroupMatch.deleteMany({});
    console.log(`✓ Deleted ${groupMatchCount} group matches`);

    // 7. Delete all user group histories
    const userGroupHistoryCount = await UserGroupHistory.countDocuments();
    await UserGroupHistory.deleteMany({});
    console.log(`✓ Deleted ${userGroupHistoryCount} user group histories`);

    // Users are reset rather than deleted, so logins keep working and email
    // addresses stay reserved. Each is saved individually so the model's
    // pre-save hooks run.
    const users = await User.find({});
    console.log(`\n✓ Found ${users.length} users to reset\n`);

    if (users.length === 0) {
      console.log('⚠️  WARNING: No users found in database!');
      console.log('You may have accidentally deleted all users.');
      console.log('Please re-seed the database or create new accounts.');
    } else {
      for (const user of users) {
        console.log(`Resetting user: ${user.name} (${user.email})`);
        
        user.status = 'individual';
        user.profileStatus = 'active';
        user.isActive = true;
        user.groupId = null;
        
        await user.save();
      }
    }

    console.log('\n✅ All users have been reset to fresh state!');
    console.log('Users can now start matching as if they just created their accounts.\n');

    // Show summary
    console.log('Summary:');
    console.log(`- ${users.length} users reset to individual status`);
    console.log(`- ${groupCount} groups deleted`);
    console.log(`- ${matchCount} matches deleted`);
    console.log(`- ${messageCount} messages deleted`);
    console.log(`- ${swipeCount} swipe actions deleted`);
    console.log(`- ${joinRequestCount} group join requests deleted`);
    console.log(`- ${groupRequestCount} group requests deleted`);
    console.log(`- ${groupMatchCount} group matches deleted`);
    console.log(`- ${userGroupHistoryCount} user group histories deleted`);

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

// Run the reset
console.log('===========================================');
console.log('     ROOMMATE FINDER - RESET ALL USERS     ');
console.log('===========================================\n');

resetAllUsers();