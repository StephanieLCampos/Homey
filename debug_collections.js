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