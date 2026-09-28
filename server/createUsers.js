/**
 * SAMPLE USER CREATION SCRIPT (maintenance utility)
 *
 * Inserts four fixed development accounts, skipping any that already exist, so
 * it is safe to re-run. Unlike seed.js it does not require an empty database,
 * which makes it the convenient way to top an existing environment back up.
 *
 * Usage: run from the server/ directory - `node createUsers.js`
 *
 * Connections:
 *   - server/models/User.js - the documents written.
 *
 * Notes:
 *   - Reads MONGO_URI (not MONGODB_URI, which is what server/index.js and
 *     server/.env use) and falls back to a database named 'homey' rather than
 *     'homey_roommate_app'. Set the variable explicitly, or this script will
 *     write to a different database than the one the server reads.
 *   - Like seed.js, it bcrypt-hashes the password before saving, and the model's
 *     pre-save hook hashes it again - so these accounts cannot be logged into
 *     with 'password123'.
 *   - All fixture accounts use @example.com addresses, which RFC 2606 reserves
 *     for documentation and which can never route to a real mailbox.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function createSampleData() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    const sampleUsers = [
      {
        email: 'jordan@example.com',
        password: 'password123',
        name: 'Jordan Rivera',
        age: 23,
        gender: 'female',
        bio: 'Student looking for a friendly roommate to share a cozy apartment!',
        photos: ['/default_user.png'],
        preferences: {
          minAge: 20,
          maxAge: 35,
          maxRent: 1500,
          location: { city: 'San Francisco', state: 'CA' },
          cleanlinessLevel: 4,
          noiseTolerance: 3,
          petFriendly: true,
          smokingAllowed: false
        }
      },
      {
        email: 'alex@example.com',
        password: 'password123',
        name: 'Alex Johnson',
        age: 25,
        gender: 'non-binary',
        bio: 'Looking for a clean, quiet place to call home. Love cooking and reading!',
        photos: ['/default_user.png'],
        preferences: {
          minAge: 22,
          maxAge: 30,
          maxRent: 1200,
          location: { city: 'San Francisco', state: 'CA' },
          cleanlinessLevel: 5,
          noiseTolerance: 2,
          petFriendly: false,
          smokingAllowed: false
        }
      },
      {
        email: 'sam@example.com',
        password: 'password123',
        name: 'Sam Chen',
        age: 22,
        gender: 'male',
        bio: 'Tech student who loves gaming and outdoor activities. Very tidy!',
        photos: ['/default_user.png'],
        preferences: {
          minAge: 20,
          maxAge: 28,
          maxRent: 1800,
          location: { city: 'San Francisco', state: 'CA' },
          cleanlinessLevel: 4,
          noiseTolerance: 4,
          petFriendly: true,
          smokingAllowed: false
        }
      },
      {
        email: 'mike@example.com',
        password: 'password123',
        name: 'Mike Rodriguez',
        age: 27,
        gender: 'male',
        bio: 'Working professional, clean and responsible. Looking for like-minded roommate.',
        photos: ['/default_user.png'],
        preferences: {
          minAge: 24,
          maxAge: 32,
          maxRent: 2000,
          location: { city: 'San Francisco', state: 'CA' },
          cleanlinessLevel: 5,
          noiseTolerance: 3,
          petFriendly: false,
          smokingAllowed: false
        }
      }
    ];
    
    for (let userData of sampleUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = new User({
          ...userData,
          password: hashedPassword
        });
        await user.save();
        console.log('Created user:', userData.name);
      } else {
        console.log('User already exists:', userData.name);
      }
    }
    
    console.log('✅ Sample data creation complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createSampleData();