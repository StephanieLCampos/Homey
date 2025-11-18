const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function listAllUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Find all users
    const allUsers = await User.find({}, 'name email _id');
    
    console.log(`\nFound ${allUsers.length} users in database:`);
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email}) - ID: ${user._id}`);
    });
    
    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error listing users:', error);
    process.exit(1);
  }
}

listAllUsers();