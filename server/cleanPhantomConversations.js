const mongoose = require('mongoose');
const User = require('./models/User');
const Match = require('./models/Match');
const SwipeAction = require('./models/SwipeAction');
const Message = require('./models/Message');
require('dotenv').config();

async function cleanPhantomConversations() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    // Step 1: Get all valid user IDs
    console.log('\n1. Getting all valid users...');
    const validUsers = await User.find({}, '_id');
    const validUserIds = validUsers.map(user => user._id.toString());
    console.log(`Found ${validUserIds.length} valid users:`, validUserIds);
    
    // Step 2: Find and remove invalid matches
    console.log('\n2. Checking for invalid matches...');
    const allMatches = await Match.find({});
    console.log(`Found ${allMatches.length} total matches`);
    
    const invalidMatches = [];
    for (const match of allMatches) {
      const user1Exists = validUserIds.includes(match.userId1.toString());
      const user2Exists = validUserIds.includes(match.userId2.toString());
      
      if (!user1Exists || !user2Exists) {
        invalidMatches.push({
          matchId: match._id,
          userId1: match.userId1.toString(),
          userId2: match.userId2.toString(),
          user1Exists,
          user2Exists
        });
      }
    }
    
    console.log(`Found ${invalidMatches.length} invalid matches:`);
    invalidMatches.forEach(match => {
      console.log(`  - Match ${match.matchId}: User1(${match.userId1}) exists: ${match.user1Exists}, User2(${match.userId2}) exists: ${match.user2Exists}`);
    });
    
    if (invalidMatches.length > 0) {
      const matchIds = invalidMatches.map(m => m.matchId);
      const deleteResult = await Match.deleteMany({ _id: { $in: matchIds } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} invalid matches`);
    }
    
    // Step 3: Find and remove invalid messages
    console.log('\n3. Checking for invalid messages...');
    const allMessages = await Message.find({});
    console.log(`Found ${allMessages.length} total messages`);
    
    const invalidMessages = [];
    for (const message of allMessages) {
      const senderExists = message.senderId ? validUserIds.includes(message.senderId.toString()) : true;
      const receiverExists = message.receiverId ? validUserIds.includes(message.receiverId.toString()) : true;
      
      if (!senderExists || !receiverExists) {
        invalidMessages.push({
          messageId: message._id,
          senderId: message.senderId ? message.senderId.toString() : 'null',
          receiverId: message.receiverId ? message.receiverId.toString() : 'null',
          senderExists,
          receiverExists,
          content: message.content ? message.content.substring(0, 50) + '...' : 'No content'
        });
      }
    }
    
    console.log(`Found ${invalidMessages.length} invalid messages:`);
    invalidMessages.forEach(msg => {
      console.log(`  - Message ${msg.messageId}: Sender(${msg.senderId}) exists: ${msg.senderExists}, Receiver(${msg.receiverId}) exists: ${msg.receiverExists}`);
      console.log(`    Content: ${msg.content}`);
    });
    
    if (invalidMessages.length > 0) {
      const messageIds = invalidMessages.map(m => m.messageId);
      const deleteResult = await Message.deleteMany({ _id: { $in: messageIds } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} invalid messages`);
    }
    
    // Step 4: Find and remove invalid swipe actions
    console.log('\n4. Checking for invalid swipe actions...');
    const allSwipeActions = await SwipeAction.find({});
    console.log(`Found ${allSwipeActions.length} total swipe actions`);
    
    const invalidSwipeActions = [];
    for (const swipe of allSwipeActions) {
      const userExists = validUserIds.includes(swipe.userId.toString());
      const targetExists = validUserIds.includes(swipe.targetUserId.toString());
      
      if (!userExists || !targetExists) {
        invalidSwipeActions.push({
          swipeId: swipe._id,
          userId: swipe.userId.toString(),
          targetUserId: swipe.targetUserId.toString(),
          userExists,
          targetExists,
          action: swipe.action
        });
      }
    }
    
    console.log(`Found ${invalidSwipeActions.length} invalid swipe actions:`);
    invalidSwipeActions.forEach(swipe => {
      console.log(`  - Swipe ${swipe.swipeId}: User(${swipe.userId}) exists: ${swipe.userExists}, Target(${swipe.targetUserId}) exists: ${swipe.targetExists} [${swipe.action}]`);
    });
    
    if (invalidSwipeActions.length > 0) {
      const swipeIds = invalidSwipeActions.map(s => s.swipeId);
      const deleteResult = await SwipeAction.deleteMany({ _id: { $in: swipeIds } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} invalid swipe actions`);
    }
    
    // Step 5: Summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`- Valid users: ${validUserIds.length}`);
    console.log(`- Invalid matches removed: ${invalidMatches.length}`);
    console.log(`- Invalid messages removed: ${invalidMessages.length}`);
    console.log(`- Invalid swipe actions removed: ${invalidSwipeActions.length}`);
    
    const totalCleaned = invalidMatches.length + invalidMessages.length + invalidSwipeActions.length;
    if (totalCleaned > 0) {
      console.log('\n🎉 Cleanup completed! Phantom conversations should now be removed.');
      console.log('Try refreshing your messages tab - the invalid conversations should be gone.');
    } else {
      console.log('\n✅ No phantom data found - database is clean!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning phantom conversations:', error);
    process.exit(1);
  }
}

cleanPhantomConversations();