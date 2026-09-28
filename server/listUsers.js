/**
 * USER LISTING SCRIPT (diagnostic utility)
 *
 * Prints the name, email and ObjectId of every user in the database. Its main
 * practical use is obtaining the ids that the other diagnostic scripts in this
 * directory expect to be pasted into them.
 *
 * Usage: run from the server/ directory - `node listUsers.js`
 *
 * Connections:
 *   - server/models/User.js
 *
 * Note: reads MONGO_URI and defaults to the 'homey' database - see the note in
 * createUsers.js about the inconsistent variable naming across these scripts.
 */
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