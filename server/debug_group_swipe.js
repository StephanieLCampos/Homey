const mongoose = require('mongoose');
const SwipeAction = require('./models/SwipeAction');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugGroupSwipe() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const targetUserId = '691e3bcac5eb1a469363d74b';
    
    // Find all swipe actions related to this target user
    const swipes = await SwipeAction.find({
      targetUserId: targetUserId,
      swipeType: 'group_to_user'
    }).populate('groupId');
    
    console.log(`Found ${swipes.length} group swipes for user ${targetUserId}:`);
    
    for (const swipe of swipes) {
      console.log('- SwipeAction ID:', swipe._id);
      console.log('  Group ID:', swipe.groupId?._id);
      console.log('  Group Name:', swipe.groupId?.name);
      console.log('  Action:', swipe.action);
      console.log('  Created At:', swipe.createdAt);
      console.log('  ---');
    }
    
    // Check the target user status
    const user = await User.findById(targetUserId);
    if (user) {
      console.log('\\nTarget User Details:');
      console.log('- Name:', user.name);
      console.log('- Status:', user.status);
      console.log('- IsActive:', user.isActive);
      console.log('- Profile Status:', user.profileStatus);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugGroupSwipe();