const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const Group = require('./models/Group');
const User = require('./models/User');
require('dotenv').config();

async function debugAlexGroup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find alex@example.com user
    const alex = await User.findOne({ email: 'alex@example.com' });
    console.log('Alex user found:', !!alex);
    if (!alex) {
      console.log('ERROR: Alex user not found');
      mongoose.disconnect();
      return;
    }
    
    console.log('Alex details:', {
      _id: alex._id,
      name: alex.name,
      email: alex.email,
      status: alex.status,
      groupId: alex.groupId,
      profileStatus: alex.profileStatus
    });
    
    // Find pending group matches for Alex
    const alexGroupMatches = await GroupMatch.find({ 
      userId: alex._id,
      status: 'pending'
    }).populate('groupId');
    
    console.log(`Found ${alexGroupMatches.length} pending group matches for Alex:`);
    
    for (const match of alexGroupMatches) {
      console.log('- GroupMatch ID:', match._id);
      console.log('  Group ID:', match.groupId?._id);
      console.log('  Group Name:', match.groupId?.name);
      console.log('  Status:', match.status);
      console.log('  Group Active:', match.groupId?.isActive);
      console.log('  Group Members:', match.groupId?.memberIds?.length);
      console.log('  Group Max Members:', match.groupId?.maxMembers);
      console.log('  Can Add Member:', match.groupId?.canAddMember());
      console.log('  ---');
    }
    
    // Check BING group specifically
    const bingGroup = await Group.findOne({ name: 'BING' });
    if (bingGroup) {
      console.log('\\nBING Group Details:');
      console.log('- ID:', bingGroup._id);
      console.log('- Name:', bingGroup.name);
      console.log('- Active:', bingGroup.isActive);
      console.log('- Members:', bingGroup.memberIds?.length);
      console.log('- Max Members:', bingGroup.maxMembers);
      console.log('- Can Add Member:', bingGroup.canAddMember());
      console.log('- Member IDs:', bingGroup.memberIds);
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugAlexGroup();