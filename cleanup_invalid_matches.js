// Script to find and remove matches that reference non-existent users
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function cleanupInvalidMatches() {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const SwipeAction = require(path.join(__dirname, 'server', 'models', 'SwipeAction'));

    console.log('Finding all matches...\n');

    // Get all matches
    const allMatches = await Match.find({});
    console.log(`Found ${allMatches.length} total matches`);

    const invalidMatches = [];
    const validUsers = await User.find({}).select('_id');
    const validUserIds = validUsers.map(u => u._id.toString());

    console.log(`Found ${validUserIds.length} valid users`);

    // Check each match
    for (const match of allMatches) {
      let isInvalid = false;
      const reasons = [];

      // Check userId1
      if (match.userId1 && !validUserIds.includes(match.userId1.toString())) {
        isInvalid = true;
        reasons.push(`userId1 ${match.userId1} not found`);
      }

      // Check userId2
      if (match.userId2 && !validUserIds.includes(match.userId2.toString())) {
        isInvalid = true;
        reasons.push(`userId2 ${match.userId2} not found`);
      }

      if (isInvalid) {
        invalidMatches.push({
          match,
          reasons
        });
      }
    }

    console.log(`\nFound ${invalidMatches.length} invalid matches:`);
    invalidMatches.forEach(({ match, reasons }, i) => {
      console.log(`${i + 1}. Match ${match._id}: ${reasons.join(', ')}`);
    });

    if (invalidMatches.length > 0) {
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise((resolve) => {
        readline.question('\nDelete these invalid matches? (yes/no): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() === 'yes') {
        const invalidMatchIds = invalidMatches.map(im => im.match._id);
        
        // Delete invalid matches
        await Match.deleteMany({ _id: { $in: invalidMatchIds } });
        console.log(`✓ Deleted ${invalidMatches.length} invalid matches`);

        // Also clean up related swipe actions
        const deletedSwipes = await SwipeAction.deleteMany({
          $or: [
            { userId: { $nin: validUserIds } },
            { targetUserId: { $nin: validUserIds } }
          ]
        });
        console.log(`✓ Deleted ${deletedSwipes.deletedCount} invalid swipe actions`);
      } else {
        console.log('Cleanup cancelled');
      }
    } else {
      console.log('✓ No invalid matches found - database is clean!');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

cleanupInvalidMatches();