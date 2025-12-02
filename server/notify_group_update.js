const mongoose = require('mongoose');
const Group = require('./models/Group');
require('dotenv').config();

// This would normally be part of the main server, but for testing:
const { Server } = require('socket.io');
const http = require('http');

async function notifyGroupUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // For this test, we'll just log what we would emit
    const bingGroup = await Group.findOne({ name: 'BING' });
    
    if (bingGroup) {
      console.log('Would emit groupUpdated to members:');
      bingGroup.memberIds.forEach((memberId, index) => {
        console.log(`${index + 1}. Emit to member: ${memberId}`);
      });
      
      console.log('Event data:', {
        groupId: bingGroup._id.toString(),
        action: 'member_removed_cleanup'
      });
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

notifyGroupUpdate();