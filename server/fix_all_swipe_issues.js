const mongoose = require('mongoose');
const SwipeAction = require('./models/SwipeAction');
require('dotenv').config();

async function fixAllSwipeIssues() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // 1. Count problematic swipes
    const problematicCount = await SwipeAction.countDocuments({
      $or: [
        { groupId: null },
        { targetGroupId: null }
      ]
    });
    console.log(`\nFound ${problematicCount} problematic swipe actions with null fields`);

    // 2. Delete ALL swipe actions with null groupId or targetGroupId
    const deleteResult = await SwipeAction.deleteMany({
      $or: [
        { groupId: null },
        { targetGroupId: null }
      ]
    });
    console.log(`Deleted ${deleteResult.deletedCount} problematic swipe actions`);

    // 3. Find and fix any swipes that don't have proper swipeType
    const noTypeCount = await SwipeAction.countDocuments({
      swipeType: { $exists: false }
    });
    if (noTypeCount > 0) {
      const updateResult = await SwipeAction.updateMany(
        { swipeType: { $exists: false } },
        { $set: { swipeType: 'user_to_user' } }
      );
      console.log(`Updated ${updateResult.modifiedCount} swipes without swipeType`);
    }

    // 4. Remove the problematic index completely
    try {
      await SwipeAction.collection.dropIndex('groupId_1_targetUserId_1');
      console.log('\nDropped groupId_1_targetUserId_1 index');
    } catch (e) {
      console.log('Index groupId_1_targetUserId_1 not found or already dropped');
    }

    try {
      await SwipeAction.collection.dropIndex('userId_1_targetGroupId_1');
      console.log('Dropped userId_1_targetGroupId_1 index');
    } catch (e) {
      console.log('Index userId_1_targetGroupId_1 not found or already dropped');
    }

    // 5. Recreate indexes with partialFilterExpression
    try {
      await SwipeAction.collection.createIndex(
        { groupId: 1, targetUserId: 1 },
        { 
          unique: true, 
          partialFilterExpression: { 
            groupId: { $exists: true, $ne: null },
            targetUserId: { $exists: true, $ne: null }
          } 
        }
      );
      console.log('Created new groupId_1_targetUserId_1 index with partial filter');
    } catch (e) {
      console.log('Error creating groupId_1_targetUserId_1 index:', e.message);
    }

    try {
      await SwipeAction.collection.createIndex(
        { userId: 1, targetGroupId: 1 },
        { 
          unique: true, 
          partialFilterExpression: { 
            userId: { $exists: true, $ne: null },
            targetGroupId: { $exists: true, $ne: null }
          } 
        }
      );
      console.log('Created new userId_1_targetGroupId_1 index with partial filter');
    } catch (e) {
      console.log('Error creating userId_1_targetGroupId_1 index:', e.message);
    }

    // 6. List all current indexes
    const indexes = await SwipeAction.collection.getIndexes();
    console.log('\nCurrent indexes on SwipeAction collection:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`  - ${indexName}`);
    });

    // 7. Verify no more problematic documents
    const finalCheck = await SwipeAction.countDocuments({
      $or: [
        { groupId: null },
        { targetGroupId: null }
      ]
    });
    console.log(`\nFinal check: ${finalCheck} documents with null fields remaining`);

    console.log('\n✅ All swipe issues have been fixed!');
    console.log('Users should now be able to swipe without errors.');

  } catch (error) {
    console.error('Error fixing swipe issues:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the fix
fixAllSwipeIssues();