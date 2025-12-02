const mongoose = require('mongoose');
const SwipeAction = require('./models/SwipeAction');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function cleanupOrphanedSwipes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all group_to_user swipe actions
    const groupToUserSwipes = await SwipeAction.find({
      swipeType: 'group_to_user'
    }).populate('groupId');
    
    console.log(`Found ${groupToUserSwipes.length} group_to_user swipe actions to check`);
    
    let orphanedCount = 0;
    for (const swipe of groupToUserSwipes) {
      // Check if the target user is still in a group or if the group still exists
      const targetUser = await User.findById(swipe.targetUserId);
      
      if (!targetUser) {
        console.log(`Deleting swipe - target user ${swipe.targetUserId} no longer exists`);
        await SwipeAction.deleteOne({ _id: swipe._id });
        orphanedCount++;
        continue;
      }
      
      if (!swipe.groupId) {
        console.log(`Deleting swipe - group no longer exists for swipe ${swipe._id}`);
        await SwipeAction.deleteOne({ _id: swipe._id });
        orphanedCount++;
        continue;
      }
      
      // If target user is individual (left group), delete the swipe
      if (targetUser.status === 'individual') {
        console.log(`Deleting swipe - user ${targetUser.name} (${targetUser._id}) is now individual, removing swipe from group ${swipe.groupId.name}`);
        await SwipeAction.deleteOne({ _id: swipe._id });
        orphanedCount++;
      }
    }
    
    console.log(`Cleaned up ${orphanedCount} orphaned group swipe actions`);
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

cleanupOrphanedSwipes();