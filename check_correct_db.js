/**
 * ACCOUNT PRESENCE CHECK (diagnostic utility)
 *
 * Read-only. Reports whether each address in a configurable list still has an
 * account in the `homey_roommate_app` database, then lists every user present.
 * Written to confirm that remove_old_accounts.js had actually taken effect - the
 * two scripts are meant to be given the same address list.
 *
 * The list ships empty; with no addresses the script just enumerates the users,
 * which is still a useful check on its own.
 *
 * Usage: run from the repository root - `node check_correct_db.js`
 *
 * Connections:
 *   - server/models/User.js
 *   - remove_old_accounts.js - deletes the accounts this script looks for.
 *
 * Notes:
 *   - The name records the reason it exists: several sibling scripts point at a
 *     database named `roommate-finder`, while the server uses
 *     `homey_roommate_app`. This one hard-codes the correct name.
 *   - Resolves mongoose out of server/node_modules, since the repository root
 *     has no dependency on it. It therefore only runs after the server's
 *     dependencies are installed.
 *   - Populate `oldEmails` locally rather than committing real personal email
 *     addresses to this published repository.
 */
// Check the correct database for old accounts
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function checkCorrectDB() {
  try {
    await mongoose.connect('mongodb://localhost:27017/homey_roommate_app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to homey_roommate_app database\n');

    const User = require(path.join(__dirname, 'server', 'models', 'User'));
    
    // Addresses to check for, mirroring the OLD_ACCOUNTS list in
    // remove_old_accounts.js. Intentionally empty: with no addresses the
    // presence check is skipped and the script simply lists every user in the
    // database, which is still useful on its own.
    //
    // Populate locally to verify a removal; do not commit real addresses.
    const oldEmails = [];

    console.log('Checking for old accounts:');
    for (const email of oldEmails) {
      const user = await User.findOne({ email });
      if (user) {
        console.log(`❌ FOUND: ${email} - ID: ${user._id}`);
      } else {
        console.log(`✅ Not found: ${email}`);
      }
    }
    
    console.log('\nAll users in database:');
    const allUsers = await User.find({}, 'email name _id');
    allUsers.forEach(u => {
      console.log(`  - ${u.email} (${u.name}) - ID: ${u._id}`);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

checkCorrectDB();