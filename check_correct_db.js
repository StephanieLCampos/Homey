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
    
    const oldEmails = [
      'stephaniec1646@gmail.com',
      'stephaniec.1646@gmail.com', 
      'ashikab@gmail.com',
      'seanlai@gmail.com',
      'mrseanlai@gmail.com',
      'mia.l.cater04@gmail.com'
    ];

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