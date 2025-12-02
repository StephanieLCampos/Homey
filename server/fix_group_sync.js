const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
require('dotenv').config();

async function fixGroupSync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\n=== Fixing Group Synchronization Issues ===\n');

    // 1. Find users with groupId but the group doesn't exist or doesn't include them
    const usersWithGroupIds = await User.find({ 
      groupId: { $exists: true, $ne: null },
      status: 'in_group'
    });

    console.log(`Found ${usersWithGroupIds.length} users marked as being in groups:`);
    
    for (const user of usersWithGroupIds) {
      console.log(`\nChecking user: ${user.name} (${user.email})`);
      console.log(`  - GroupId: ${user.groupId}`);
      
      // Check if the group exists
      const group = await Group.findById(user.groupId);
      if (!group) {
        console.log(`  ❌ Group ${user.groupId} not found! Fixing user...`);
        user.groupId = null;
        user.status = 'individual';
        user.profileStatus = 'active';
        await user.save();
        console.log(`  ✅ User ${user.name} reset to individual status`);
        continue;
      }

      // Check if user is actually in the group's memberIds
      const isInGroup = group.memberIds.some(memberId => memberId.toString() === user._id.toString());
      if (!isInGroup) {
        console.log(`  ❌ User not in group's memberIds! Adding them...`);
        group.memberIds.push(user._id);
        await group.save();
        console.log(`  ✅ Added ${user.name} to group ${group.name}`);
      } else {
        console.log(`  ✅ User correctly in group ${group.name}`);
      }
    }

    // 2. Find groups with memberIds that point to users not marked as in_group
    const groups = await Group.find({ isActive: true });
    
    console.log(`\nChecking ${groups.length} active groups:`);
    
    for (const group of groups) {
      console.log(`\nGroup: ${group.name} (${group._id})`);
      console.log(`  - Members in group: ${group.memberIds.length}`);
      
      const validMemberIds = [];
      
      for (const memberId of group.memberIds) {
        const member = await User.findById(memberId);
        if (!member) {
          console.log(`  ❌ Member ${memberId} not found in Users collection`);
          continue;
        }
        
        if (member.status !== 'in_group' || member.groupId?.toString() !== group._id.toString()) {
          console.log(`  ❌ Member ${member.name} not properly marked as in group. Fixing...`);
          member.status = 'in_group';
          member.groupId = group._id;
          member.profileStatus = 'paused';
          await member.save();
          console.log(`  ✅ Fixed ${member.name} group status`);
        } else {
          console.log(`  ✅ Member ${member.name} correctly configured`);
        }
        
        validMemberIds.push(memberId);
      }
      
      // Update group if memberIds changed
      if (validMemberIds.length !== group.memberIds.length) {
        group.memberIds = validMemberIds;
        await group.save();
        console.log(`  ✅ Updated group memberIds (${validMemberIds.length} valid members)`);
      }
    }

    // 3. Final verification
    console.log('\n=== Final Verification ===');
    
    const finalUsers = await User.find({ status: 'in_group' });
    console.log(`\nUsers in groups: ${finalUsers.length}`);
    for (const user of finalUsers) {
      console.log(`  - ${user.name}: groupId ${user.groupId}`);
    }
    
    const finalGroups = await Group.find({ isActive: true });
    console.log(`\nActive groups: ${finalGroups.length}`);
    for (const group of finalGroups) {
      console.log(`  - ${group.name}: ${group.memberIds.length} members`);
    }

    console.log('\n✅ Group synchronization completed!');
    console.log('\n🔄 Please restart the server and clear browser cache/localStorage');

  } catch (error) {
    console.error('Error fixing group sync:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixGroupSync();