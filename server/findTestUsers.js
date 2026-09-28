/**
 * TEST-USER SEARCH SCRIPT (diagnostic utility)
 *
 * Read-only. Locates leftover test accounts three ways: names containing
 * 'test', names ending in a digit, and an explicit list of names that were
 * appearing in the server logs at the time this was written. Written as the
 * investigation step that preceded removeTestUsers.js.
 *
 * Usage: run from the server/ directory - `node findTestUsers.js`
 *
 * Connections:
 *   - server/models/User.js
 *   - server/removeTestUsers.js - deletes what this script finds.
 *
 * Notes:
 *   - The hard-coded name list is specific to one historic debugging session
 *     and has no ongoing meaning.
 *   - Reads MONGO_URI, defaulting to the 'homey' database.
 */
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