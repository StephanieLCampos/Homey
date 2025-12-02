// Fix script to ensure user status is consistent after leaving group
// Run this in the server directory: node ../fix_user_status.js <user-email>

const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function fixUserStatus(userEmail) {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log('User not found:', userEmail);
      return;
    }

    console.log('\nChecking user:', user.name);
    console.log('Current status:', user.status);
    console.log('Current profileStatus:', user.profileStatus);
    console.log('Current isActive:', user.isActive);
    console.log('Current groupId:', user.groupId);

    // Check if user is actually in any groups
    const activeGroups = await Group.find({
      memberIds: user._id,
      isActive: true
    });

    console.log('\nActive groups containing user:', activeGroups.length);

    if (activeGroups.length === 0 && (user.status === 'in_group' || user.groupId)) {
      console.log('\nFIXING: User marked as in group but no active groups found');
      
      // Fix user status
      user.status = 'individual';
      user.profileStatus = 'active';
      user.isActive = true;
      user.groupId = null;
      
      await user.save();
      
      console.log('User status fixed!');
      console.log('New status:', user.status);
      console.log('New profileStatus:', user.profileStatus);
      console.log('New isActive:', user.isActive);

      // Also update any group-type matches to accepted
      const groupMatches = await Match.find({
        $or: [
          { userId1: user._id },
          { userId2: user._id }
        ],
        status: 'group'
      });

      console.log('\nFound', groupMatches.length, 'group-type matches to fix');
      
      for (const match of groupMatches) {
        match.status = 'accepted';
        await match.save();
        console.log('Fixed match:', match._id);
      }
    } else if (activeGroups.length > 0) {
      console.log('\nUser is correctly in', activeGroups.length, 'active group(s)');
      
      // Ensure user status is correct
      if (user.status !== 'in_group' || user.profileStatus !== 'paused') {
        user.status = 'in_group';
        user.profileStatus = 'paused';
        user.groupId = activeGroups[0]._id;
        await user.save();
        console.log('Fixed user status to match group membership');
      }
    } else {
      console.log('\nUser status appears correct - no fixes needed');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.log('Usage: node fix_user_status.js <user-email>');
  console.log('This will fix user status inconsistencies after leaving a group');
  process.exit(1);
}

fixUserStatus(email);