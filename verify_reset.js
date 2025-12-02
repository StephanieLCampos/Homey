// Verify that the reset actually worked
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function verifyReset() {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const Message = require(path.join(__dirname, 'server', 'models', 'Message'));
    const SwipeAction = require(path.join(__dirname, 'server', 'models', 'SwipeAction'));
    const GroupJoinRequest = require(path.join(__dirname, 'server', 'models', 'GroupJoinRequest'));

    console.log('\nDatabase Status Check:');
    console.log('======================');
    
    const groupCount = await Group.countDocuments();
    console.log(`Groups: ${groupCount}`);
    
    const matchCount = await Match.countDocuments();
    console.log(`Matches: ${matchCount}`);
    if (matchCount > 0) {
      const matches = await Match.find().limit(5);
      console.log('  Sample matches:');
      matches.forEach(m => console.log(`    - ${m._id} status: ${m.status}`));
    }
    
    const messageCount = await Message.countDocuments();
    console.log(`Messages: ${messageCount}`);
    
    const swipeCount = await SwipeAction.countDocuments();
    console.log(`Swipe Actions: ${swipeCount}`);
    
    const joinRequestCount = await GroupJoinRequest.countDocuments();
    console.log(`Join Requests: ${joinRequestCount}`);
    
    const users = await User.find();
    console.log(`\nUsers: ${users.length}`);
    users.forEach(u => {
      console.log(`  - ${u.name} (${u.email}): status=${u.status}, profileStatus=${u.profileStatus}, groupId=${u.groupId}`);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

verifyReset();