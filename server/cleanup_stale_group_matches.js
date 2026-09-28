/**
 * STALE GROUP-MATCH CLEANUP (destructive maintenance utility)
 *
 * Deletes pending group invitations that can no longer be accepted: those
 * addressed to a user who has already joined a group, and those pointing at a
 * group that no longer exists.
 *
 * Both conditions leave dead invitation cards in the recipient's matches list.
 *
 * Usage: run from the server/ directory - `node cleanup_stale_group_matches.js`
 *
 * Connections:
 *   - server/models/GroupMatch.js, User.js
 *   - server/index.js - the accept and leave endpoints that now clear these inline.
 *
 * KNOWN ISSUE - this script currently crashes on its first query. It calls
 * `.populate('groupId userId')`, which requires Mongoose to resolve GroupMatch's
 * `ref: 'Group'`, but the Group model is never imported and therefore never
 * registered. The result is:
 *
 *     MissingSchemaError: Schema hasn't been registered for model "Group".
 *
 * The fix is a single line - `require('./models/Group');` alongside the imports
 * below - matching what detect_and_fix_orphaned_group_matches.js already does.
 * Left unapplied here because this pass is documentation-only.
 */
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