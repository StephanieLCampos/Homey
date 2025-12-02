const mongoose = require('mongoose');
const SwipeAction = require('./models/SwipeAction');
const User = require('./models/User');
require('dotenv').config();

async function cleanupGroupUsersSwipes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all users who are currently in groups
    const groupUsers = await User.find({ 
      status: 'in_group',
      groupId: { $exists: true, $ne: null }
    }).select('_id name email status groupId');
    
    console.log(`\nFound ${groupUsers.length} users currently in groups:`);
    groupUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) in group ${user.groupId}`);
    });

    if (groupUsers.length === 0) {
      console.log('No users in groups found. Nothing to clean up.');
      return;
    }

    const groupUserIds = groupUsers.map(user => user._id);

    // Find all SwipeActions involving these group users
    const swipesToDelete = await SwipeAction.find({
      $or: [
        { userId: { $in: groupUserIds } },
        { targetUserId: { $in: groupUserIds } }
      ]
    });

    console.log(`\nFound ${swipesToDelete.length} SwipeActions to clean up:`);
    swipesToDelete.forEach(swipe => {
      console.log(`  - SwipeAction ${swipe._id}: ${swipe.userId} -> ${swipe.targetUserId} (${swipe.action})`);
    });

    if (swipesToDelete.length === 0) {
      console.log('No SwipeActions to clean up.');
      return;
    }

    // Confirm before deleting
    console.log('\n⚠️  This will delete all SwipeActions involving users currently in groups.');
    console.log('This will remove pending matches for both group users and individual users.');
    
    // Delete the SwipeActions
    const deleteResult = await SwipeAction.deleteMany({
      $or: [
        { userId: { $in: groupUserIds } },
        { targetUserId: { $in: groupUserIds } }
      ]
    });

    console.log(`\n✅ Successfully deleted ${deleteResult.deletedCount} SwipeActions`);
    console.log('Group users no longer have pending individual matches.');
    console.log('Individual users no longer have pending matches with group users.');

  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

cleanupGroupUsersSwipes();