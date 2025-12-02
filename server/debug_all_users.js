const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
require('dotenv').config();

async function debugAllUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all users with status in_group
    const usersInGroups = await User.find({ status: 'in_group' });
    console.log(`Found ${usersInGroups.length} users in groups:`);
    
    for (const user of usersInGroups) {
      console.log(`- ${user.name} (${user.email}): groupId=${user.groupId}`);
    }
    
    // Check the BING group specifically
    const bingGroup = await Group.findOne({ name: 'BING' });
    if (bingGroup) {
      console.log('\nBING Group Details:');
      console.log('- ID:', bingGroup._id);
      console.log('- Members count:', bingGroup.memberIds?.length);
      console.log('- Max Members:', bingGroup.maxMembers);
      console.log('- Target Status:', bingGroup.target_status);
      console.log('- Can Send Likes:', bingGroup.canSendLikes());
      
      // Check each member
      console.log('\nBING Group Members:');
      for (let i = 0; i < bingGroup.memberIds.length; i++) {
        const memberId = bingGroup.memberIds[i];
        const member = await User.findById(memberId);
        console.log(`${i + 1}. ${memberId} - ${member ? member.name + ' (' + member.email + ')' : 'USER NOT FOUND'}`);
      }
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugAllUsers();