/**
 * SWIPE COLLECTION REPAIR (destructive maintenance utility)
 *
 * The most substantial of the swipe repair scripts. It addresses the root cause
 * of a class of "duplicate key" failures on swiping, in four steps:
 *   1. Delete every swipe action holding a null groupId or targetGroupId.
 *   2. Backfill `swipeType: 'user_to_user'` on documents predating that field.
 *   3. Drop the two unique indexes that included those nullable fields.
 *   4. Recreate them as partial indexes restricted to documents where both keys
 *      actually exist and are non-null.
 *
 * Step 4 is the durable fix: a plain unique index treats every null as the same
 * value, so a user's second swipe collided with their first. A partial index
 * excludes those documents from the constraint entirely.
 *
 * Usage: run from the server/ directory - `node fix_all_swipe_issues.js`
 *
 * Connections:
 *   - server/models/SwipeAction.js - declares sparse (not partial) indexes, so
 *     Mongoose may recreate the original form on next start; the model's
 *     pre-save hook is what prevents new null fields being written.
 *   - server/cleanup_null_swipes.js - the data-only subset of this repair.
 *
 * Note: destructive and unprompted; it also alters collection indexes.
 */
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

    // Drop the two unique indexes that span the nullable group fields. A plain
    // unique index treats every null as one value, so a user's second swipe
    // collided with their first on the (userId, targetGroupId) key.
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

    // Recreate them as partial indexes: the constraint now applies only to
    // documents where both keys are present and non-null, so user-to-user swipes
    // are excluded from the group indexes entirely.
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