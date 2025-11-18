const mongoose = require('mongoose');
const User = require('./models/User');
const SwipeAction = require('./models/SwipeAction');
const Match = require('./models/Match');
require('dotenv').config();

async function testApiDirectly() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Use Stephanie's ID (the logged in user)
    const userId = '691517f74ee4da2486087e75'; // From our previous findings
    
    console.log(`\nSimulating API call for user: ${userId}`);
    
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      console.log('User not found!');
      process.exit(1);
    }
    
    console.log(`Current user: ${currentUser.name} ${currentUser.email}`);
    
    // Get users already swiped on
    const swipedUserIds = await SwipeAction.find({ userId }).distinct('targetUserId');
    console.log('Swiped user IDs:', swipedUserIds);
    
    // Get users you've already matched with (both pending and accepted)
    const matchedUsers = await Match.find({
      $or: [
        { userId1: userId },
        { userId2: userId }
      ]
    });
    const matchedUserIds = matchedUsers.map(match => 
      match.userId1.toString() === userId ? match.userId2 : match.userId1
    );
    console.log('Matched user IDs:', matchedUserIds);
    
    // Combine all excluded user IDs
    const excludedUserIds = [...swipedUserIds, ...matchedUserIds];
    console.log('All excluded user IDs:', excludedUserIds);
    
    // Find potential matches - exact same query as the API
    const potentialMatches = await User.find({ 
      _id: { 
        $ne: userId,
        $nin: excludedUserIds
      }, 
      isActive: true,
      $or: [
        { groupId: { $exists: false } },
        { groupId: null }
      ]
    });
    
    console.log('Found potential matches:', potentialMatches.length);
    console.log('User names:', potentialMatches.map(u => u.name));
    
    console.log('\nFull potential matches details:');
    potentialMatches.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - ID: ${user._id}, Active: ${user.isActive}, GroupId: ${user.groupId}`);
    });
    
    // Convert to safe objects (what the API returns)
    const result = potentialMatches.map(user => user.toSafeObject());
    console.log('Final result count:', result.length);
    console.log('Final result names:', result.map(u => u.name));
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing API directly:', error);
    process.exit(1);
  }
}

testApiDirectly();