/**
 * ORPHANED DATA CLEANUP (destructive maintenance utility)
 *
 * The most complete of the orphan-cleanup scripts, and the one documented in the
 * README. It reports, then - after a yes/no confirmation - deletes five classes
 * of record left behind when a user account is removed directly rather than
 * through the deactivation endpoint:
 *   1. Matches naming a missing user (or with a null second participant).
 *   2. Swipe actions with a missing swiper or target.
 *   3. Messages from a missing sender.
 *   4. Group join requests from a missing requester.
 *   5. Empty groups.
 *
 * The practical consequence of leaving these in place is "phantom" matches and
 * conversations in the UI whose counterpart renders blank.
 *
 * Usage: run from the repository root - `node cleanup_orphaned_accounts.js`
 *
 * Connections:
 *   - server/models/User.js, Match.js, Message.js, SwipeAction.js,
 *     GroupJoinRequest.js, Group.js
 *   - remove_old_accounts.js - deletes accounts, creating exactly this debris.
 *   - cleanup_invalid_matches.js, server/cleanPhantomConversations.js - narrower
 *     variants of the same idea.
 *
 * Notes:
 *   - Prompts before deleting, and reports counts first.
 *   - The "empty/orphaned groups" query previously passed `$nin: [validUserIds]`
 *     - the id array nested one level too deep - which matched effectively every
 *     group, so confirming the prompt deleted all of them. It now uses
 *     `$elemMatch`; see the comment at that query.
 *   - Hard-codes the `roommate-finder` database - see the audit note on
 *     database naming.
 */
// Script to remove all orphaned user accounts and related data
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function cleanupOrphanedAccounts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🧹 Cleaning up orphaned accounts and data...\n');

    // Load all models
    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const Message = require(path.join(__dirname, 'server', 'models', 'Message'));
    const SwipeAction = require(path.join(__dirname, 'server', 'models', 'SwipeAction'));
    const GroupJoinRequest = require(path.join(__dirname, 'server', 'models', 'GroupJoinRequest'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));

    // Get all valid users
    const validUsers = await User.find({});
    const validUserIds = validUsers.map(u => u._id.toString());
    
    console.log('Current valid users:');
    validUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ID: ${user._id}`);
    });
    console.log(`\nTotal valid users: ${validUsers.length}`);

    // Check for orphaned data
    console.log('\n=== CHECKING FOR ORPHANED DATA ===\n');

    // 1. Orphaned matches
    const orphanedMatches = await Match.find({
      $or: [
        { userId1: { $nin: validUserIds } },
        { userId2: { $nin: validUserIds } },
        { userId2: null }
      ]
    });
    
    console.log(`❌ Orphaned matches: ${orphanedMatches.length}`);
    orphanedMatches.forEach(match => {
      console.log(`  - Match ${match._id}: userId1=${match.userId1}, userId2=${match.userId2}`);
    });

    // 2. Orphaned swipe actions.
    //
    // The `$ne: null` guards are required. `userId` and `targetUserId` are only
    // conditionally required on the schema: a 'group_to_user' swipe has no
    // `userId` (it has `groupId`), and a 'user_to_group' swipe has no
    // `targetUserId` (it has `targetGroupId`). In MongoDB a bare `$nin` also
    // matches documents where the field is absent, so without these guards every
    // group swipe would be reported as an orphan and deleted.
    const orphanedSwipes = await SwipeAction.find({
      $or: [
        { userId: { $ne: null, $nin: validUserIds } },
        { targetUserId: { $ne: null, $nin: validUserIds } }
      ]
    });
    
    console.log(`❌ Orphaned swipe actions: ${orphanedSwipes.length}`);
    orphanedSwipes.slice(0, 5).forEach(swipe => {
      console.log(`  - Swipe ${swipe._id}: ${swipe.userId} -> ${swipe.targetUserId} (${swipe.action})`);
    });
    if (orphanedSwipes.length > 5) {
      console.log(`  ... and ${orphanedSwipes.length - 5} more`);
    }

    // 3. Orphaned messages.
    //
    // `$ne: null` is required for the same reason as above. System messages -
    // the "X has joined/left the group chat" notices written by server/index.js -
    // are saved with `senderId: null`, which a bare `$nin` matches. Without this
    // guard every system message in every group would be deleted.
    const orphanedMessages = await Message.find({
      senderId: { $ne: null, $nin: validUserIds }
    });
    
    console.log(`❌ Orphaned messages: ${orphanedMessages.length}`);

    // 4. Orphaned group join requests
    const orphanedJoinRequests = await GroupJoinRequest.find({
      requester: { $nin: validUserIds }
    });
    
    console.log(`❌ Orphaned join requests: ${orphanedJoinRequests.length}`);

    // 5. Empty groups, and groups holding at least one deleted member.
    //
    // `$elemMatch` is required here rather than a bare `$nin`. The field is an
    // array, so `{ memberIds: { $nin: validUserIds } }` would ask "is the whole
    // array absent from this list of ids", which is not the question; and
    // `{ $nin: [validUserIds] }` - the array nested one level too deep - asks
    // whether memberIds is exactly equal to the full user list, which is false
    // for virtually every group and therefore matched all of them.
    //
    // `$elemMatch: { $nin: validUserIds }` correctly means "at least one element
    // of memberIds is not a valid user id". The `$size: 0` clause covers the
    // genuinely empty case, which `$elemMatch` cannot match.
    const emptyGroups = await Group.find({
      $or: [
        { memberIds: { $size: 0 } },
        { memberIds: { $elemMatch: { $nin: validUserIds } } }
      ]
    });
    
    console.log(`❌ Empty/orphaned groups: ${emptyGroups.length}`);

    const totalOrphaned = orphanedMatches.length + orphanedSwipes.length + 
                         orphanedMessages.length + orphanedJoinRequests.length + emptyGroups.length;

    if (totalOrphaned === 0) {
      console.log('\n✅ No orphaned data found - database is clean!');
      mongoose.connection.close();
      return;
    }

    console.log(`\n⚠️  Found ${totalOrphaned} orphaned records`);
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question('\nDelete all orphaned data? This will clean up old account references. (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() === 'yes') {
      console.log('\n🗑️  Deleting orphaned data...\n');

      // Delete orphaned matches
      if (orphanedMatches.length > 0) {
        await Match.deleteMany({ _id: { $in: orphanedMatches.map(m => m._id) } });
        console.log(`✓ Deleted ${orphanedMatches.length} orphaned matches`);
      }

      // Delete orphaned swipe actions
      if (orphanedSwipes.length > 0) {
        await SwipeAction.deleteMany({ _id: { $in: orphanedSwipes.map(s => s._id) } });
        console.log(`✓ Deleted ${orphanedSwipes.length} orphaned swipe actions`);
      }

      // Delete orphaned messages
      if (orphanedMessages.length > 0) {
        await Message.deleteMany({ _id: { $in: orphanedMessages.map(m => m._id) } });
        console.log(`✓ Deleted ${orphanedMessages.length} orphaned messages`);
      }

      // Delete orphaned join requests
      if (orphanedJoinRequests.length > 0) {
        await GroupJoinRequest.deleteMany({ _id: { $in: orphanedJoinRequests.map(r => r._id) } });
        console.log(`✓ Deleted ${orphanedJoinRequests.length} orphaned join requests`);
      }

      // Delete empty groups
      if (emptyGroups.length > 0) {
        await Group.deleteMany({ _id: { $in: emptyGroups.map(g => g._id) } });
        console.log(`✓ Deleted ${emptyGroups.length} empty/orphaned groups`);
      }

      console.log('\n✅ Database cleanup complete!');
      console.log('All orphaned references to deleted accounts have been removed.');
      console.log('\nEmail addresses belonging to deleted accounts can now be reused for new registrations.');
    } else {
      console.log('Cleanup cancelled');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

cleanupOrphanedAccounts();