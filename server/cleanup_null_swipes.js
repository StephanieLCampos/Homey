const mongoose = require('mongoose');
const SwipeAction = require('./models/SwipeAction');
const Match = require('./models/Match');
require('dotenv').config();

async function cleanupNullSwipes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find SwipeActions with null userId or targetUserId
    const nullSwipes = await SwipeAction.find({
      $or: [
        { userId: null },
        { targetUserId: null },
        { userId: { $exists: false } },
        { targetUserId: { $exists: false } }
      ]
    });
    
    console.log(`Found ${nullSwipes.length} SwipeActions with null userId or targetUserId:`);
    
    for (const swipe of nullSwipes) {
      console.log('- SwipeAction ID:', swipe._id);
      console.log('  userId:', swipe.userId);
      console.log('  targetUserId:', swipe.targetUserId);
      console.log('  action:', swipe.action);
      console.log('  swipeType:', swipe.swipeType);
    }
    
    if (nullSwipes.length > 0) {
      const deleteResult = await SwipeAction.deleteMany({
        $or: [
          { userId: null },
          { targetUserId: null },
          { userId: { $exists: false } },
          { targetUserId: { $exists: false } }
        ]
      });
      console.log(`Deleted ${deleteResult.deletedCount} corrupted SwipeActions`);
    }
    
    // Also check for Matches with null userId1 or userId2
    const nullMatches = await Match.find({
      $or: [
        { userId1: null },
        { userId2: null },
        { userId1: { $exists: false } },
        { userId2: { $exists: false } }
      ]
    });
    
    console.log(`Found ${nullMatches.length} Matches with null userId1 or userId2:`);
    
    for (const match of nullMatches) {
      console.log('- Match ID:', match._id);
      console.log('  userId1:', match.userId1);
      console.log('  userId2:', match.userId2);
      console.log('  status:', match.status);
    }
    
    if (nullMatches.length > 0) {
      const deleteMatchResult = await Match.deleteMany({
        $or: [
          { userId1: null },
          { userId2: null },
          { userId1: { $exists: false } },
          { userId2: { $exists: false } }
        ]
      });
      console.log(`Deleted ${deleteMatchResult.deletedCount} corrupted Matches`);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

cleanupNullSwipes();