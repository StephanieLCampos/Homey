// Debug script to check user status after leaving group
// Run this in the server directory: node ../debug_user_status.js

const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));
const User = require(path.join(__dirname, 'server', 'models', 'User'));

async function debugUserStatus(userEmail) {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.log('User not found:', userEmail);
      return;
    }

    console.log('\nUser Status Debug Info:');
    console.log('======================');
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Status:', user.status);
    console.log('Profile Status:', user.profileStatus);
    console.log('Is Active:', user.isActive);
    console.log('Group ID:', user.groupId);
    console.log('Created At:', user.createdAt);
    console.log('Updated At:', user.updatedAt);

    // Check if they have any matches
    const Match = require(path.join(__dirname, 'server', 'models', 'Match'));
    const matches = await Match.find({
      $or: [
        { userId1: user._id },
        { userId2: user._id }
      ]
    });

    console.log('\nMatches:', matches.length);
    matches.forEach(match => {
      console.log('  - Match ID:', match._id, 'Status:', match.status);
    });

    // Check if they're in any groups
    const Group = require(path.join(__dirname, 'server', 'models', 'Group'));
    const groups = await Group.find({
      memberIds: user._id
    });

    console.log('\nGroups:', groups.length);
    groups.forEach(group => {
      console.log('  - Group:', group.name, 'ID:', group._id);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

// Get email from command line argument
const email = process.argv[2];
if (!email) {
  console.log('Usage: node debug_user_status.js <user-email>');
  process.exit(1);
}

debugUserStatus(email);