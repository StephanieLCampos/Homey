/**
 * UNMATCH BEHAVIOUR TEST (diagnostic utility, writes to the database)
 *
 * An end-to-end check of the rule that unmatching must make two users eligible
 * to match again. It takes the first two users in the database, has them like
 * each other, creates the match, confirms each is excluded from the other's
 * swipe deck, then performs the unmatch deletions and confirms the exclusion is
 * gone.
 *
 * This is a manual script rather than an automated test: it asserts nothing,
 * reports pass or fail by printing, and is not run by any test runner.
 *
 * Usage: run from the server/ directory - `node testUnmatchFunctionality.js`
 *
 * Connections:
 *   - server/models/User.js, Match.js, SwipeAction.js
 *   - server/index.js - the unmatch endpoint whose behaviour it mirrors.
 *
 * Notes:
 *   - Writes to whatever database it is pointed at, using two real user accounts
 *     chosen arbitrarily. Do not run against data that matters.
 *   - It reproduces the endpoint's deletions rather than calling it, so it
 *     verifies the intended behaviour rather than the shipped implementation.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Match = require('./models/Match');
const SwipeAction = require('./models/SwipeAction');
require('dotenv').config();

async function testUnmatchFunctionality() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Get two users for testing
    const users = await User.find().limit(2);
    if (users.length < 2) {
      console.log('Need at least 2 users for testing');
      process.exit(1);
    }
    
    const user1 = users[0];
    const user2 = users[1];
    
    console.log(`\nTesting unmatch functionality between:`);
    console.log(`User 1: ${user1.name} (${user1._id})`);
    console.log(`User 2: ${user2.name} (${user2._id})`);
    
    // Step 1: Create swipe actions (simulating they liked each other)
    console.log('\n1. Creating swipe actions...');
    const swipe1 = new SwipeAction({
      userId: user1._id,
      targetUserId: user2._id,
      action: 'like'
    });
    const swipe2 = new SwipeAction({
      userId: user2._id,
      targetUserId: user1._id,
      action: 'like'
    });
    await swipe1.save();
    await swipe2.save();
    console.log('✅ Swipe actions created');
    
    // Step 2: Create a match
    console.log('\n2. Creating match...');
    const match = new Match({
      userId1: user1._id,
      userId2: user2._id,
      status: 'accepted'
    });
    await match.save();
    console.log('✅ Match created:', match._id);
    
    // Step 3: Check that user2 is excluded from user1's potential matches
    console.log('\n3. Checking potential matches before unmatch...');
    const swipedUserIds = await SwipeAction.find({ userId: user1._id }).distinct('targetUserId');
    const matchedUsers = await Match.find({
      $or: [
        { userId1: user1._id },
        { userId2: user1._id }
      ]
    });
    const matchedUserIds = matchedUsers.map(match => 
      match.userId1.toString() === user1._id.toString() ? match.userId2 : match.userId1
    );
    const excludedUserIds = [...swipedUserIds, ...matchedUserIds];
    
    const isUser2Excluded = excludedUserIds.some(id => id.toString() === user2._id.toString());
    console.log(`User2 is excluded from User1's potential matches: ${isUser2Excluded ? '✅ YES' : '❌ NO'}`);
    
    // Step 4: Simulate unmatch (delete match and swipe actions)
    console.log('\n4. Simulating unmatch...');
    await Match.findByIdAndDelete(match._id);
    await SwipeAction.deleteMany({
      $or: [
        { userId: user1._id, targetUserId: user2._id },
        { userId: user2._id, targetUserId: user1._id }
      ]
    });
    console.log('✅ Match and swipe actions deleted');
    
    // Step 5: Check that user2 can now appear in user1's potential matches
    console.log('\n5. Checking potential matches after unmatch...');
    const newSwipedUserIds = await SwipeAction.find({ userId: user1._id }).distinct('targetUserId');
    const newMatchedUsers = await Match.find({
      $or: [
        { userId1: user1._id },
        { userId2: user1._id }
      ]
    });
    const newMatchedUserIds = newMatchedUsers.map(match => 
      match.userId1.toString() === user1._id.toString() ? match.userId2 : match.userId1
    );
    const newExcludedUserIds = [...newSwipedUserIds, ...newMatchedUserIds];
    
    const isUser2StillExcluded = newExcludedUserIds.some(id => id.toString() === user2._id.toString());
    console.log(`User2 is still excluded from User1's potential matches: ${isUser2StillExcluded ? '❌ YES (PROBLEM!)' : '✅ NO (SUCCESS!)'}`);
    
    console.log('\n📊 Test Summary:');
    console.log('- Swipe actions deleted:', swipedUserIds.length - newSwipedUserIds.length);
    console.log('- Matches deleted:', matchedUserIds.length - newMatchedUserIds.length);
    console.log('- Users can now rematch:', !isUser2StillExcluded ? 'YES ✅' : 'NO ❌');
    
    if (!isUser2StillExcluded) {
      console.log('\n🎉 SUCCESS! Unmatch functionality working correctly - users can now match again!');
    } else {
      console.log('\n❌ FAILURE! Users are still excluded from potential matches');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error testing unmatch functionality:', error);
    process.exit(1);
  }
}

testUnmatchFunctionality();