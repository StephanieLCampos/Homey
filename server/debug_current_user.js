/**
 * SINGLE-USER GROUP STATE DUMP (diagnostic utility)
 *
 * Read-only. Prints one user's status fields and, if they belong to a group,
 * that group's capacity flags plus a per-member existence check.
 *
 * Usage: run from the server/ directory - `node debug_current_user.js`
 *
 * Connections:
 *   - server/models/User.js, Group.js
 *   - debug_user_status.js (repository root) - the general-purpose equivalent,
 *     which takes the email as a command-line argument.
 *
 * Note: the target email is hard-coded to a fixture account from a historic
 * local database, so the script prints nothing elsewhere. Superseded by
 * debug_user_status.js; listed in the dead-file audit.
 */
const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
require('dotenv').config();

async function debugCurrentUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Check who might be the current logged in user - let's look at Steph C since they were in the group
    const stephC = await User.findOne({ email: 'steph@example.com' });
    if (stephC) {
      console.log('Steph C details:', {
        _id: stephC._id,
        name: stephC.name,
        email: stephC.email,
        status: stephC.status,
        groupId: stephC.groupId,
        profileStatus: stephC.profileStatus
      });
      
      if (stephC.groupId) {
        const group = await Group.findById(stephC.groupId);
        if (group) {
          console.log('\nSteph\'s Group Details:');
          console.log('- ID:', group._id);
          console.log('- Name:', group.name);
          console.log('- Members count:', group.memberIds?.length);
          console.log('- Max Members:', group.maxMembers);
          console.log('- Target Status:', group.target_status);
          console.log('- Group Status:', group.group_status);
          console.log('- Can Send Likes:', group.canSendLikes());
          console.log('- Can Add Member:', group.canAddMember());
          console.log('- Member IDs:', group.memberIds);
          
          // Check if all member IDs still exist
          console.log('\nChecking member validity:');
          for (let i = 0; i < group.memberIds.length; i++) {
            const memberId = group.memberIds[i];
            const member = await User.findById(memberId);
            console.log(`Member ${i + 1}: ${memberId} - ${member ? 'EXISTS (' + member.name + ')' : 'NOT FOUND'}`);
          }
        }
      }
    }
    
    mongoose.disconnect();
  } catch(e) { 
    console.error('Error:', e); 
    mongoose.disconnect(); 
  }
}

debugCurrentUser();