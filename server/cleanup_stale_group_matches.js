const mongoose = require('mongoose');
const GroupMatch = require('./models/GroupMatch');
const User = require('./models/User');
require('dotenv').config();

async function cleanupStaleGroupMatches() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find all pending group matches
    const pendingMatches = await GroupMatch.find({ status: 'pending' }).populate('groupId userId');
    
    console.log('Found', pendingMatches.length, 'pending group matches');
    
    let cleanupCount = 0;
    for (const match of pendingMatches) {
      const user = await User.findById(match.userId);
      
      // Clean up matches where user is already in a group (shouldn't have pending group matches)
      if (user && user.status === 'in_group') {
        console.log('Cleaning up stale group match for user already in group:', user.email);
        await GroupMatch.deleteOne({ _id: match._id });
        cleanupCount++;
      }
      // Clean up matches where the target group no longer exists
      else if (!match.groupId) {
        console.log('Cleaning up group match for non-existent group');
        await GroupMatch.deleteOne({ _id: match._id });
        cleanupCount++;
      }
    }
    
    console.log('Cleaned up', cleanupCount, 'stale group matches');
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

cleanupStaleGroupMatches();