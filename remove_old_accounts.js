// Script to remove specific old user accounts
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

// List of old account emails to delete
const OLD_ACCOUNTS = [
  'stephaniec1646@gmail.com',
  'stephaniec.1646@gmail.com', 
  'ashikab@gmail.com',
  'seanlai@gmail.com',
  'mrseanlai@gmail.com',
  'mia.l.cater04@gmail.com'
  // Add any other old emails you want to remove
];

async function removeOldAccounts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/homey_roommate_app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🗑️  Removing old user accounts...\n');

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const Message = require(path.join(__dirname, 'server', 'models', 'Message'));
    const SwipeAction = require(path.join(__dirname, 'server', 'models', 'SwipeAction'));
    const GroupJoinRequest = require(path.join(__dirname, 'server', 'models', 'GroupJoinRequest'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));

    // Find old accounts
    const oldUsers = await User.find({ 
      email: { $in: OLD_ACCOUNTS }
    });

    if (oldUsers.length === 0) {
      console.log('✅ No old accounts found to remove.');
      mongoose.connection.close();
      return;
    }

    console.log(`Found ${oldUsers.length} old accounts to remove:`);
    oldUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - ID: ${user._id}`);
    });

    const oldUserIds = oldUsers.map(u => u._id.toString());

    // Show what related data will be deleted
    const relatedMatches = await Match.find({
      $or: [
        { userId1: { $in: oldUserIds } },
        { userId2: { $in: oldUserIds } }
      ]
    });

    const relatedSwipes = await SwipeAction.find({
      $or: [
        { userId: { $in: oldUserIds } },
        { targetUserId: { $in: oldUserIds } }
      ]
    });

    const relatedMessages = await Message.find({
      senderId: { $in: oldUserIds }
    });

    const relatedJoinRequests = await GroupJoinRequest.find({
      requester: { $in: oldUserIds }
    });

    const relatedGroups = await Group.find({
      memberIds: { $in: oldUserIds }
    });

    console.log('\nRelated data that will also be deleted:');
    console.log(`  - ${relatedMatches.length} matches`);
    console.log(`  - ${relatedSwipes.length} swipe actions`);
    console.log(`  - ${relatedMessages.length} messages`);
    console.log(`  - ${relatedJoinRequests.length} join requests`);
    console.log(`  - ${relatedGroups.length} groups`);

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise((resolve) => {
      readline.question('\nDelete these old accounts and all related data? (yes/no): ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() === 'yes') {
      console.log('\n🗑️  Deleting old accounts and related data...\n');

      // Delete related data first
      if (relatedMatches.length > 0) {
        await Match.deleteMany({ _id: { $in: relatedMatches.map(m => m._id) } });
        console.log(`✓ Deleted ${relatedMatches.length} related matches`);
      }

      if (relatedSwipes.length > 0) {
        await SwipeAction.deleteMany({ _id: { $in: relatedSwipes.map(s => s._id) } });
        console.log(`✓ Deleted ${relatedSwipes.length} related swipe actions`);
      }

      if (relatedMessages.length > 0) {
        await Message.deleteMany({ _id: { $in: relatedMessages.map(m => m._id) } });
        console.log(`✓ Deleted ${relatedMessages.length} related messages`);
      }

      if (relatedJoinRequests.length > 0) {
        await GroupJoinRequest.deleteMany({ _id: { $in: relatedJoinRequests.map(r => r._id) } });
        console.log(`✓ Deleted ${relatedJoinRequests.length} related join requests`);
      }

      if (relatedGroups.length > 0) {
        await Group.deleteMany({ _id: { $in: relatedGroups.map(g => g._id) } });
        console.log(`✓ Deleted ${relatedGroups.length} related groups`);
      }

      // Finally, delete the user accounts
      await User.deleteMany({ _id: { $in: oldUserIds } });
      console.log(`✓ Deleted ${oldUsers.length} old user accounts`);

      console.log('\n✅ Old accounts removed successfully!');
      console.log('These email addresses can now be used for new registrations:');
      oldUsers.forEach(user => {
        console.log(`  - ${user.email}`);
      });

    } else {
      console.log('Deletion cancelled');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

removeOldAccounts();