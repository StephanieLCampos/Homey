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

    // 2. Orphaned swipe actions
    const orphanedSwipes = await SwipeAction.find({
      $or: [
        { userId: { $nin: validUserIds } },
        { targetUserId: { $nin: validUserIds } }
      ]
    });
    
    console.log(`❌ Orphaned swipe actions: ${orphanedSwipes.length}`);
    orphanedSwipes.slice(0, 5).forEach(swipe => {
      console.log(`  - Swipe ${swipe._id}: ${swipe.userId} -> ${swipe.targetUserId} (${swipe.action})`);
    });
    if (orphanedSwipes.length > 5) {
      console.log(`  ... and ${orphanedSwipes.length - 5} more`);
    }

    // 3. Orphaned messages
    const orphanedMessages = await Message.find({
      senderId: { $nin: validUserIds }
    });
    
    console.log(`❌ Orphaned messages: ${orphanedMessages.length}`);

    // 4. Orphaned group join requests
    const orphanedJoinRequests = await GroupJoinRequest.find({
      requester: { $nin: validUserIds }
    });
    
    console.log(`❌ Orphaned join requests: ${orphanedJoinRequests.length}`);

    // 5. Empty groups
    const emptyGroups = await Group.find({
      $or: [
        { memberIds: { $size: 0 } },
        { memberIds: { $nin: [validUserIds] } }
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
      console.log('\nOld account emails like stephaniec1646@gmail.com can now be used for new registrations.');
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