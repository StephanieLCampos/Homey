/**
 * SWIPE DECK REPRODUCTION SCRIPT (diagnostic utility)
 *
 * Read-only. Re-runs the individual-candidate half of
 * GET /api/users/:id/potential-matches directly against the database - the
 * swiped and matched exclusion sets, then the candidate query - and prints each
 * intermediate result. Written to determine whether an unexpectedly empty or
 * over-full swipe deck originated in the data or in the API layer.
 *
 * Usage: run from the server/ directory - `node debugPotentialMatches.js`
 *
 * Connections:
 *   - server/models/User.js, SwipeAction.js, Match.js
 *   - server/index.js - the endpoint this reproduces.
 *   - server/testApiDirectly.js - a near-duplicate of this script.
 *
 * Notes:
 *   - The user id is hard-coded and no longer resolves.
 *   - Reproduces an older version of the endpoint: it filters on `isActive`
 *     rather than the current `profileStatus`, and omits the group candidates
 *     the endpoint now appends. Listed in the dead-file audit.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const SwipeAction = require('./models/SwipeAction');
const Match = require('./models/Match');
require('dotenv').config();

async function debugPotentialMatches() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Use the same user ID that shows Test Users (assuming it's Stephanie's)
    const userId = '691517f74ee4da2486087e75'; // Stephanie's ID
    
    console.log(`\nDebugging potential matches for user: ${userId}`);
    
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
    
    console.log('\nPotential matches from database:');
    console.log('Count:', potentialMatches.length);
    console.log('Names:', potentialMatches.map(u => u.name));
    console.log('\nFull user details:');
    potentialMatches.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - ID: ${user._id}, Active: ${user.isActive}, GroupId: ${user.groupId}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error debugging potential matches:', error);
    process.exit(1);
  }
}

debugPotentialMatches();