/**
 * ORPHANED GROUP SWIPE CLEANUP (destructive maintenance utility)
 *
 * Examines every 'group_to_user' swipe and deletes it when it can no longer lead
 * anywhere: the target user has been deleted, the originating group has been
 * deleted, or the target has since become an individual again.
 *
 * The third case is the reason this exists - a stale swipe from a group that has
 * already parted ways with a user would otherwise block that pair from ever
 * matching again.
 *
 * Usage: run from the server/ directory - `node cleanup_orphaned_swipes.js`
 *
 * Connections:
 *   - server/models/SwipeAction.js, Group.js, User.js
 *   - server/index.js - the leave endpoint that now clears these inline.
 *
 * Note: deletes one document at a time inside the loop; fine at development
 * scale, but it would want a bulk operation against a large collection.
 */
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