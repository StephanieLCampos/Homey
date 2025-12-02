// Seed script to create sample users
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const sampleUsers = [
  {
    email: 'alex@email.com',
    password: 'password123',
    name: 'Alex Thompson',
    age: 25,
    gender: 'male',
    bio: 'Software engineer looking for a quiet, clean roommate',
    photos: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400'
    ],
    preferences: {
      minAge: 21,
      maxAge: 35,
      preferredGender: ['male', 'female', 'non-binary', 'other'],
      maxRent: 1500,
      cleanlinessLevel: 4,
      noiseTolerance: 2,
      petFriendly: false,
      smokingAllowed: false,
      location: {
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94105'
      }
    },
    status: 'individual',
    profileStatus: 'active',
    isActive: true
  },
  {
    email: 'sam@email.com',
    password: 'password123',
    name: 'Sam Rodriguez',
    age: 28,
    gender: 'non-binary',
    bio: 'Grad student, night owl, love cooking and board games',
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400'
    ],
    preferences: {
      minAge: 23,
      maxAge: 40,
      preferredGender: ['male', 'female', 'non-binary', 'other'],
      maxRent: 1200,
      cleanlinessLevel: 3,
      noiseTolerance: 4,
      petFriendly: true,
      smokingAllowed: false,
      location: {
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94110'
      }
    },
    status: 'individual',
    profileStatus: 'active',
    isActive: true
  },
  {
    email: 'jordan@email.com',
    password: 'password123',
    name: 'Jordan Lee',
    age: 30,
    gender: 'female',
    bio: 'Marketing professional, yoga enthusiast, early riser',
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
    ],
    preferences: {
      minAge: 25,
      maxAge: 45,
      preferredGender: ['female', 'non-binary'],
      maxRent: 2000,
      cleanlinessLevel: 5,
      noiseTolerance: 1,
      petFriendly: false,
      smokingAllowed: false,
      location: {
        city: 'San Francisco',
        state: 'CA',
        zipCode: '94102'
      }
    },
    status: 'individual',
    profileStatus: 'active',
    isActive: true
  },
  {
    email: 'mike@email.com',
    password: 'password123',
    name: 'Mike Chen',
    age: 26,
    gender: 'male',
    bio: 'Data analyst, gaming enthusiast, flexible schedule',
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
      'https://images.unsplash.com/photo-1499996860823-5214fcc65f8f?w=400'
    ],
    preferences: {
      minAge: 22,
      maxAge: 35,
      preferredGender: ['male'],
      maxRent: 1800,
      cleanlinessLevel: 3,
      noiseTolerance: 3,
      petFriendly: true,
      smokingAllowed: false,
      location: {
        city: 'Oakland',
        state: 'CA',
        zipCode: '94612'
      }
    },
    status: 'individual',
    profileStatus: 'active',
    isActive: true
  }
];

async function seedDatabase() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/homey_roommate_app', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to database');
    
    // Check if users already exist
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0) {
      console.log(`Database already has ${existingUsers} users. Skipping seed.`);
      console.log('To reseed, first run: node ../reset_all_users.js');
      mongoose.connection.close();
      return;
    }
    
    // Create users
    console.log('\nCreating sample users...\n');
    
    for (const userData of sampleUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      
      await user.save();
      console.log(`✓ Created user: ${user.name} (${user.email})`);
    }
    
    console.log('\n✅ Database seeded successfully!');
    console.log(`Created ${sampleUsers.length} sample users`);
    console.log('\nYou can log in with any of these emails using password: password123');
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error seeding database:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Run the seed
seedDatabase();