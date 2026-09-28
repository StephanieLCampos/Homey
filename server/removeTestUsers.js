/**
 * TEST-USER REMOVAL SCRIPT (destructive maintenance utility)
 *
 * Deletes every account whose name matches /test user( \d+)?/i together with its
 * matches, swipe actions and messages, in that order, so no orphaned references
 * are left behind.
 *
 * Usage: run from the server/ directory - `node removeTestUsers.js`
 *
 * Connections:
 *   - server/models/User.js, Match.js, SwipeAction.js, Message.js
 *   - server/findTestUsers.js - the read-only preview of what this will delete.
 *
 * Notes:
 *   - Destructive and unprompted: it deletes as soon as it is run.
 *   - The swipe cleanup filters on `swipedUserId`, which is not a field on the
 *     SwipeAction schema (the correct name is `targetUserId`), so swipes
 *     *received* by a test user are not removed. Flagged rather than fixed, as
 *     this pass is documentation-only.
 *   - Reads MONGO_URI, defaulting to the 'homey' database.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Match = require('./models/Match');
const SwipeAction = require('./models/SwipeAction');
const Message = require('./models/Message');
require('dotenv').config();

async function removeTestUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Find all users with "Test User" in their name (including numbered variants)
    const testUsers = await User.find({ 
      name: { $regex: /test user( \d+)?/i } 
    });
    
    if (testUsers.length === 0) {
      console.log('No Test Users found in database');
      process.exit(0);
    }
    
    console.log(`Found ${testUsers.length} Test Users to remove:`);
    testUsers.forEach(user => {
      console.log(`- ${user.name} (${user.email})`);
    });
    
    // Get array of Test User IDs
    const testUserIds = testUsers.map(user => user._id);
    
    // Delete dependent records before the users themselves, so an interrupted run
    // cannot leave matches and messages pointing at accounts that are already gone.
    console.log('\nRemoving related data...');
    
    // Remove matches involving test users
    const matchesRemoved = await Match.deleteMany({
      $or: [
        { userId1: { $in: testUserIds } },
        { userId2: { $in: testUserIds } }
      ]
    });
    console.log(`Removed ${matchesRemoved.deletedCount} matches`);
    
    // Remove swipe actions by or for test users
    const swipesRemoved = await SwipeAction.deleteMany({
      $or: [
        { userId: { $in: testUserIds } },
        { swipedUserId: { $in: testUserIds } }
      ]
    });
    console.log(`Removed ${swipesRemoved.deletedCount} swipe actions`);
    
    // Remove messages sent by or to test users
    const messagesRemoved = await Message.deleteMany({
      $or: [
        { senderId: { $in: testUserIds } },
        { receiverId: { $in: testUserIds } }
      ]
    });
    console.log(`Removed ${messagesRemoved.deletedCount} messages`);
    
    // Finally remove the test users themselves
    const usersRemoved = await User.deleteMany({
      _id: { $in: testUserIds }
    });
    console.log(`Removed ${usersRemoved.deletedCount} test users`);
    
    console.log('\n✅ Test user cleanup complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error removing test users:', error);
    process.exit(1);
  }
}

removeTestUsers();