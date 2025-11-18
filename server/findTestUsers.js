const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function findTestUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Search for any users with "test" in the name (case insensitive)
    const testUsers = await User.find({ 
      name: { $regex: /test/i } 
    });
    
    console.log(`\nFound ${testUsers.length} users with 'test' in name:`);
    testUsers.forEach((user, index) => {
      console.log(`${index + 1}. "${user.name}" (${user.email}) - ID: ${user._id}`);
    });
    
    // Also search for numbered users
    const numberedUsers = await User.find({ 
      name: { $regex: /\d+$/ } 
    });
    
    console.log(`\nFound ${numberedUsers.length} users with numbers in name:`);
    numberedUsers.forEach((user, index) => {
      console.log(`${index + 1}. "${user.name}" (${user.email}) - ID: ${user._id}`);
    });
    
    // Search specifically for the names we see in the logs
    const specificNames = ['Test User 2', 'Test User 3', 'Test User 4', 'Test User 5', 'Sean Lai'];
    
    for (const name of specificNames) {
      const user = await User.findOne({ name: name });
      if (user) {
        console.log(`\nFound specific user: "${user.name}" (${user.email}) - ID: ${user._id}`);
      } else {
        console.log(`\nUser "${name}" not found`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error finding test users:', error);
    process.exit(1);
  }
}

findTestUsers();