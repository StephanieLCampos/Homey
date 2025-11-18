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
    
    // Remove related data first
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