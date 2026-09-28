/**
 * COLLECTION DUMP (diagnostic utility)
 *
 * Read-only. Enumerates every collection in the database and prints its document
 * count plus the first five documents in full. Useful as a first look at an
 * unfamiliar or suspect database, since it goes through the raw driver and so
 * shows fields that the Mongoose schemas would strip.
 *
 * Usage: run from the repository root - `node debug_collections.js`
 *
 * Connections:
 *   - server/node_modules/mongoose - resolved explicitly; see the note below.
 *
 * Notes:
 *   - Hard-codes the database name `roommate-finder`, which is not the database
 *     the server uses (`homey_roommate_app` per server/.env). Point it at the
 *     right name, or it will report an empty database.
 *   - Prints whole documents, including password hashes.
 */
// Script to see what data is actually in all collections
const path = require('path');
const mongoose = require(path.join(__dirname, 'server', 'node_modules', 'mongoose'));

async function debugCollections() {
  try {
    await mongoose.connect('mongodb://localhost:27017/roommate-finder', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in database:');
    collections.forEach(col => console.log(`- ${col.name}`));

    console.log('\n=== DETAILED COLLECTION DATA ===\n');

    // Check each collection
    for (const col of collections) {
      const collection = mongoose.connection.db.collection(col.name);
      const count = await collection.countDocuments();
      console.log(`\n${col.name.toUpperCase()} (${count} documents):`);
      
      if (count > 0) {
        const docs = await collection.find({}).limit(5).toArray();
        docs.forEach((doc, i) => {
          console.log(`  ${i + 1}. ${JSON.stringify(doc, null, 2)}`);
        });
        if (count > 5) {
          console.log(`  ... and ${count - 5} more`);
        }
      }
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    mongoose.connection.close();
  }
}

debugCollections();