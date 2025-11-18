const mongoose = require('mongoose');
const User = require('./models/User');
const Match = require('./models/Match');
const Message = require('./models/Message');
require('dotenv').config();

async function cleanOrphanedMatches() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/homey');
    console.log('Connected to MongoDB');
    
    console.log('\n🔍 Looking for orphaned matches (matches with deleted users)...');
    
    // Get all matches and populate user data (this will show null for deleted users)
    const allMatches = await Match.find({}).populate('userId1 userId2', 'name email');
    
    console.log(`Found ${allMatches.length} total matches`);
    
    const orphanedMatches = [];
    const validMatches = [];
    
    for (const match of allMatches) {
      // Check if either user is null (deleted)
      if (!match.userId1 || !match.userId2) {
        orphanedMatches.push({
          matchId: match._id,
          userId1: match.userId1 ? match.userId1._id : 'DELETED',
          userId2: match.userId2 ? match.userId2._id : 'DELETED',
          userId1Name: match.userId1 ? match.userId1.name : 'DELETED USER',
          userId2Name: match.userId2 ? match.userId2.name : 'DELETED USER',
          status: match.status,
          createdAt: match.createdAt
        });
      } else {
        validMatches.push(match);
      }
    }
    
    console.log(`\n📊 Analysis:`);
    console.log(`- Valid matches: ${validMatches.length}`);
    console.log(`- Orphaned matches: ${orphanedMatches.length}`);
    
    if (orphanedMatches.length > 0) {
      console.log(`\n❌ Found ${orphanedMatches.length} orphaned matches:`);
      orphanedMatches.forEach((match, index) => {
        console.log(`  ${index + 1}. Match ${match.matchId}:`);
        console.log(`     User1: ${match.userId1Name} (${match.userId1})`);
        console.log(`     User2: ${match.userId2Name} (${match.userId2})`);
        console.log(`     Status: ${match.status}`);
        console.log(`     Created: ${match.createdAt}`);
        console.log('');
      });
      
      // Delete the orphaned matches
      const matchIdsToDelete = orphanedMatches.map(m => m.matchId);
      
      console.log('🗑️  Deleting orphaned matches...');
      const deleteResult = await Match.deleteMany({ _id: { $in: matchIdsToDelete } });
      console.log(`✅ Deleted ${deleteResult.deletedCount} orphaned matches`);
      
      // Also clean up any messages associated with these orphaned matches
      console.log('\n🗑️  Cleaning up messages from orphaned conversations...');
      let messagesDeleted = 0;
      
      for (const orphanedMatch of orphanedMatches) {
        // Delete messages where either sender or receiver is the deleted user
        const messagesToDelete = await Message.deleteMany({
          $or: [
            { senderId: orphanedMatch.userId1 === 'DELETED' ? null : orphanedMatch.userId1 },
            { receiverId: orphanedMatch.userId1 === 'DELETED' ? null : orphanedMatch.userId1 },
            { senderId: orphanedMatch.userId2 === 'DELETED' ? null : orphanedMatch.userId2 },
            { receiverId: orphanedMatch.userId2 === 'DELETED' ? null : orphanedMatch.userId2 }
          ]
        });
        messagesDeleted += messagesToDelete.deletedCount;
      }
      
      console.log(`✅ Deleted ${messagesDeleted} orphaned messages`);
      
    } else {
      console.log('\n✅ No orphaned matches found!');
    }
    
    // Test the conversations endpoint logic
    console.log('\n🧪 Testing conversations endpoint logic...');
    
    // Get your user ID (from the error log)
    const yourUserId = '6912c0436817d2294e60ddaa';
    
    const userMatches = await Match.find({
      $or: [
        { userId1: yourUserId },
        { userId2: yourUserId }
      ],
      status: 'accepted'
    }).populate('userId1 userId2', 'name photos email');
    
    console.log(`Found ${userMatches.length} matches for user ${yourUserId}`);
    
    const conversations = userMatches.map((match, index) => {
      const otherUser = match.userId1?._id?.toString() === yourUserId ? match.userId2 : match.userId1;
      
      console.log(`  Match ${index + 1}: otherUser = ${otherUser ? otherUser.name : 'UNDEFINED'} (${otherUser ? otherUser._id : 'NO ID'})`);
      
      return {
        id: `${yourUserId < (otherUser?._id?.toString() || 'undefined') ? yourUserId : (otherUser?._id?.toString() || 'undefined')}_${yourUserId < (otherUser?._id?.toString() || 'undefined') ? (otherUser?._id?.toString() || 'undefined') : yourUserId}`,
        matchId: match._id,
        otherUser: otherUser ? {
          id: otherUser._id,
          name: otherUser.name,
          photo: otherUser.photos?.[0] || null,
          email: otherUser.email
        } : null
      };
    });
    
    const validConversations = conversations.filter(conv => conv.otherUser !== null);
    console.log(`Valid conversations: ${validConversations.length}`);
    console.log(`Invalid conversations (causing errors): ${conversations.length - validConversations.length}`);
    
    console.log('\n🎉 Cleanup completed!');
    console.log('Try refreshing your messages tab - the phantom conversations should be gone.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error cleaning orphaned matches:', error);
    process.exit(1);
  }
}

cleanOrphanedMatches();