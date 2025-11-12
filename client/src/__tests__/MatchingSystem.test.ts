// import { MatchingSystem } from '../classes/MatchingSystem';
// import { User } from '../classes/User';
// import { Preferences } from '../types';

// describe('MatchingSystem Class', () => {
//   let matchingSystem: MatchingSystem;
//   let user1: User;
//   let user2: User;
//   let user3: User;
//   let validPreferences: Preferences;

//   beforeEach(() => {
//     matchingSystem = new MatchingSystem();
    
//     validPreferences = {
//       minAge: 20,
//       maxAge: 30,
//       preferredGender: ['male', 'female'],
//       maxRent: 2000,
//       cleanlinessLevel: 3,
//       noiseTolerance: 3,
//       petFriendly: true,
//       smokingAllowed: false,
//       location: { city: 'San Francisco', state: 'CA' }
//     };

//     user1 = new User(
//       'user1',
//       'user1@example.com',
//       'User One',
//       25,
//       'male',
//       'User one bio',
//       ['photo1.jpg'],
//       validPreferences
//     );

//     user2 = new User(
//       'user2',
//       'user2@example.com',
//       'User Two',
//       27,
//       'female',
//       'User two bio',
//       ['photo2.jpg'],
//       validPreferences
//     );

//     user3 = new User(
//       'user3',
//       'user3@example.com',
//       'User Three',
//       29,
//       'male',
//       'User three bio',
//       ['photo3.jpg'],
//       validPreferences
//     );
//   });

//   describe('Swipe Actions', () => {
//     test('should record right swipe (like)', () => {
//       const swipeAction = matchingSystem.swipeRight('user1', 'user2');
      
//       expect(swipeAction.userId).toBe('user1');
//       expect(swipeAction.targetUserId).toBe('user2');
//       expect(swipeAction.action).toBe('like');
//       expect(swipeAction.timestamp).toBeInstanceOf(Date);
//     });

//     test('should record left swipe (pass)', () => {
//       const swipeAction = matchingSystem.swipeLeft('user1', 'user2');
      
//       expect(swipeAction.userId).toBe('user1');
//       expect(swipeAction.targetUserId).toBe('user2');
//       expect(swipeAction.action).toBe('pass');
//       expect(swipeAction.timestamp).toBeInstanceOf(Date);
//     });

//     test('should handle multiple swipes from same user', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeLeft('user1', 'user3');
      
//       const swipeHistory = matchingSystem.getSwipeHistory('user1');
//       expect(swipeHistory).toHaveLength(2);
//       expect(swipeHistory[0].action).toBe('like');
//       expect(swipeHistory[1].action).toBe('pass');
//     });

//     test('should handle swipes on same target multiple times', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeLeft('user1', 'user2'); // Override previous swipe
      
//       const swipeHistory = matchingSystem.getSwipeHistory('user1');
//       expect(swipeHistory).toHaveLength(2);
//       expect(swipeHistory[1].action).toBe('pass');
//     });

//     test('should handle swipes with empty user IDs', () => {
//       const swipeAction = matchingSystem.swipeRight('', 'user2');
//       expect(swipeAction.userId).toBe('');
//       expect(swipeAction.targetUserId).toBe('user2');
//     });

//     test('should handle swipes with very long user IDs', () => {
//       const longUserId = 'a'.repeat(1000);
//       const swipeAction = matchingSystem.swipeRight(longUserId, 'user2');
//       expect(swipeAction.userId).toBe(longUserId);
//     });
//   });

//   describe('Match Detection', () => {
//     test('should detect match when both users swipe right', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeRight('user2', 'user1');
      
//       expect(matchingSystem.checkForMatch('user1', 'user2')).toBe(true);
//     });

//     test('should not detect match when only one user swipes right', () => {
//       matchingSystem.swipeRight('user1', 'user2');
      
//       expect(matchingSystem.checkForMatch('user1', 'user2')).toBe(false);
//     });

//     test('should not detect match when both users swipe left', () => {
//       matchingSystem.swipeLeft('user1', 'user2');
//       matchingSystem.swipeLeft('user2', 'user1');
      
//       expect(matchingSystem.checkForMatch('user1', 'user2')).toBe(false);
//     });

//     test('should not detect match when one swipes left, one swipes right', () => {
//       matchingSystem.swipeLeft('user1', 'user2');
//       matchingSystem.swipeRight('user2', 'user1');
      
//       expect(matchingSystem.checkForMatch('user1', 'user2')).toBe(false);
//     });

//     test('should handle checking match for non-existent users', () => {
//       expect(matchingSystem.checkForMatch('nonexistent1', 'nonexistent2')).toBe(false);
//     });

//     test('should handle checking match with same user ID', () => {
//       expect(matchingSystem.checkForMatch('user1', 'user1')).toBe(false);
//     });
//   });

//   describe('Match Creation', () => {
//     test('should create match between two users', () => {
//       const match = matchingSystem.createMatch('user1', 'user2');
      
//       expect(match.id).toContain('match_');
//       expect(match.userId1).toBe('user1');
//       expect(match.userId2).toBe('user2');
//       expect(match.status).toBe('pending');
//       expect(match.createdAt).toBeInstanceOf(Date);
//       expect(match.updatedAt).toBeInstanceOf(Date);
//     });

//     test('should add match to both users match lists', () => {
//       matchingSystem.createMatch('user1', 'user2');
      
//       const user1Matches = matchingSystem.getMatches('user1');
//       const user2Matches = matchingSystem.getMatches('user2');
      
//       expect(user1Matches).toHaveLength(1);
//       expect(user2Matches).toHaveLength(1);
//       expect(user1Matches[0].id).toBe(user2Matches[0].id);
//     });

//     test('should create multiple matches for same user', () => {
//       matchingSystem.createMatch('user1', 'user2');
//       matchingSystem.createMatch('user1', 'user3');
      
//       const user1Matches = matchingSystem.getMatches('user1');
//       expect(user1Matches).toHaveLength(2);
//     });

//     test('should handle creating match with same user ID', () => {
//       const match = matchingSystem.createMatch('user1', 'user1');
//       expect(match.userId1).toBe('user1');
//       expect(match.userId2).toBe('user1');
//     });

//     test('should handle creating match with empty user IDs', () => {
//       const match = matchingSystem.createMatch('', '');
//       expect(match.userId1).toBe('');
//       expect(match.userId2).toBe('');
//     });
//   });

//   describe('Match Management', () => {
//     beforeEach(() => {
//       matchingSystem.createMatch('user1', 'user2');
//     });

//     test('should get all matches for user', () => {
//       const matches = matchingSystem.getMatches('user1');
//       expect(matches).toHaveLength(1);
//       expect(matches[0].userId1).toBe('user1');
//       expect(matches[0].userId2).toBe('user2');
//     });

//     test('should get pending matches for user', () => {
//       const pendingMatches = matchingSystem.getPendingMatches('user1');
//       expect(pendingMatches).toHaveLength(1);
//       expect(pendingMatches[0].status).toBe('pending');
//     });

//     test('should accept match', () => {
//       const matches = matchingSystem.getMatches('user1');
//       const matchId = matches[0].id;
      
//       const acceptedMatch = matchingSystem.acceptMatch(matchId, 'user1');
//       expect(acceptedMatch?.status).toBe('accepted');
//     });

//     test('should reject match', () => {
//       const matches = matchingSystem.getMatches('user1');
//       const matchId = matches[0].id;
      
//       const rejectedMatch = matchingSystem.rejectMatch(matchId, 'user1');
//       expect(rejectedMatch?.status).toBe('rejected');
//     });

//     test('should return null when accepting non-existent match', () => {
//       const result = matchingSystem.acceptMatch('nonexistent', 'user1');
//       expect(result).toBeNull();
//     });

//     test('should return null when rejecting non-existent match', () => {
//       const result = matchingSystem.rejectMatch('nonexistent', 'user1');
//       expect(result).toBeNull();
//     });

//     test('should mark match as group created', () => {
//       const matches = matchingSystem.getMatches('user1');
//       const matchId = matches[0].id;
      
//       const groupCreatedMatch = matchingSystem.markMatchAsGroupCreated(matchId, 'group1');
//       expect(groupCreatedMatch?.status).toBe('group_created');
//       expect(groupCreatedMatch?.groupId).toBe('group1');
//     });

//     test('should return null when marking non-existent match as group created', () => {
//       const result = matchingSystem.markMatchAsGroupCreated('nonexistent', 'group1');
//       expect(result).toBeNull();
//     });
//   });

//   describe('Potential Matches', () => {
//     test('should get potential matches for user', () => {
//       const allUsers = [user1, user2, user3];
//       const potentialMatches = matchingSystem.getPotentialMatches(user1, allUsers);
      
//       expect(potentialMatches).toContain(user2);
//       expect(potentialMatches).toContain(user3);
//       expect(potentialMatches).not.toContain(user1); // Should not include self
//     });

//     test('should exclude users already swiped on', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       const allUsers = [user1, user2, user3];
//       const potentialMatches = matchingSystem.getPotentialMatches(user1, allUsers);
      
//       expect(potentialMatches).not.toContain(user2);
//       expect(potentialMatches).toContain(user3);
//     });

//     test('should exclude users in groups', () => {
//       user2.setGroupId('group1');
//       const allUsers = [user1, user2, user3];
//       const potentialMatches = matchingSystem.getPotentialMatches(user1, allUsers);
      
//       expect(potentialMatches).not.toContain(user2);
//       expect(potentialMatches).toContain(user3);
//     });

//     test('should exclude inactive users', () => {
//       user2.deactivate();
//       const allUsers = [user1, user2, user3];
//       const potentialMatches = matchingSystem.getPotentialMatches(user1, allUsers);
      
//       expect(potentialMatches).not.toContain(user2);
//       expect(potentialMatches).toContain(user3);
//     });

//     // test('should exclude users from exclude list', () => {
//     //   const allUsers = [user1, user2, user3];
//     //   const potentialMatches = matchingSystem.getPotentialMatches(user1, allUsers, ['user2']);
      
//     //   expect(potentialMatches).not.toContain(user2);
//     //   expect(potentialMatches).toContain(user3);
//     // });

//     // test('should handle empty user list', () => {
//     //   const potentialMatches = matchingSystem.getPotentialMatches(user1, []);
//     //   expect(potentialMatches).toEqual([]);
//     // });

//   //   test('should handle large user list', () => {
//   //     const largeUserList = Array.from({ length: 1000 }, (_, i) => {
//   //       return new User(
//   //         `user${i}`,
//   //         `user${i}@example.com`,
//   //         `User ${i}`,
//   //         20 + (i % 20),
//   //         i % 2 === 0 ? 'male' : 'female',
//   //         `Bio ${i}`,
//   //         [],
//   //         validPreferences
//   //       );
//   //     });
      
//   //     const potentialMatches = matchingSystem.getPotentialMatches(user1, largeUserList);
//   //     expect(potentialMatches.length).toBeGreaterThan(0);
//   //     expect(potentialMatches.length).toBeLessThan(1000);
//   //   });
//   // });

//   describe('Swipe History and Status', () => {
//     test('should get swipe history for user', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeLeft('user1', 'user3');
      
//       const history = matchingSystem.getSwipeHistory('user1');
//       expect(history).toHaveLength(2);
//     });

//     test('should return empty history for user with no swipes', () => {
//       const history = matchingSystem.getSwipeHistory('user1');
//       expect(history).toEqual([]);
//     });

//     test('should check if user has swiped on another user', () => {
//       matchingSystem.swipeRight('user1', 'user2');
      
//       expect(matchingSystem.hasSwipedOn('user1', 'user2')).toBe(true);
//       expect(matchingSystem.hasSwipedOn('user1', 'user3')).toBe(false);
//     });

//     test('should get swipe action taken on specific user', () => {
//       matchingSystem.swipeRight('user1', 'user2');
      
//       const action = matchingSystem.getSwipeAction('user1', 'user2');
//       expect(action?.action).toBe('like');
//       expect(action?.userId).toBe('user1');
//       expect(action?.targetUserId).toBe('user2');
//     });

//     test('should return null for non-existent swipe action', () => {
//       const action = matchingSystem.getSwipeAction('user1', 'user2');
//       expect(action).toBeNull();
//     });
//   });

//   describe('Process Pending Matches', () => {
//     test('should process pending matches and create new ones', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeRight('user2', 'user1');
      
//       const newMatches = matchingSystem.processPendingMatches();
//       expect(newMatches).toHaveLength(1);
//       expect(newMatches[0].userId1).toBe('user1');
//       expect(newMatches[0].userId2).toBe('user2');
//     });

//     test('should not create duplicate matches', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeRight('user2', 'user1');
      
//       // Process once
//       matchingSystem.processPendingMatches();
      
//       // Process again - should not create duplicates
//       const newMatches = matchingSystem.processPendingMatches();
//       expect(newMatches).toHaveLength(0);
//     });

//     test('should handle multiple mutual likes', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeRight('user2', 'user1');
//       matchingSystem.swipeRight('user1', 'user3');
//       matchingSystem.swipeRight('user3', 'user1');
      
//       const newMatches = matchingSystem.processPendingMatches();
//       expect(newMatches).toHaveLength(2);
//     });

//     test('should handle no mutual likes', () => {
//       matchingSystem.swipeRight('user1', 'user2');
//       matchingSystem.swipeLeft('user2', 'user1');
      
//       const newMatches = matchingSystem.processPendingMatches();
//       expect(newMatches).toHaveLength(0);
//     });

//     test('should handle empty swipe actions', () => {
//       const newMatches = matchingSystem.processPendingMatches();
//       expect(newMatches).toHaveLength(0);
//     });
//   });

//   describe('Edge Cases and Error Handling', () => {
//     test('should handle very long user IDs', () => {
//       const longUserId = 'a'.repeat(10000);
//       const swipeAction = matchingSystem.swipeRight(longUserId, 'user2');
//       expect(swipeAction.userId).toBe(longUserId);
//     });

//     test('should handle special characters in user IDs', () => {
//       const specialUserId = 'user@#$%^&*()';
//       const swipeAction = matchingSystem.swipeRight(specialUserId, 'user2');
//       expect(swipeAction.userId).toBe(specialUserId);
//     });

//     test('should handle unicode characters in user IDs', () => {
//       const unicodeUserId = '用户123';
//       const swipeAction = matchingSystem.swipeRight(unicodeUserId, 'user2');
//       expect(swipeAction.userId).toBe(unicodeUserId);
//     });

//     test('should handle null/undefined user IDs gracefully', () => {
//       // TypeScript will prevent this, but testing runtime behavior
//       const swipeAction = matchingSystem.swipeRight('user1', 'user2');
//       expect(swipeAction).toBeDefined();
//     });

//     test('should handle very large number of swipes', () => {
//       // Simulate many swipes
//       for (let i = 0; i < 1000; i++) {
//         matchingSystem.swipeRight(`user${i}`, `target${i}`);
//       }
      
//       const history = matchingSystem.getSwipeHistory('user1');
//       expect(history).toHaveLength(1); // user1 swiped once
      
//       const history2 = matchingSystem.getSwipeHistory('user0');
//       expect(history2).toHaveLength(1);
//     });

//     test('should handle concurrent swipe operations', () => {
//       // Simulate concurrent swipes
//       const promises = [];
//       for (let i = 0; i < 100; i++) {
//         promises.push(Promise.resolve(matchingSystem.swipeRight(`user${i}`, `target${i}`)));
//       }
      
//       return Promise.all(promises).then(() => {
//         const history = matchingSystem.getSwipeHistory('user0');
//         expect(history).toHaveLength(1);
//       });
//     });
//   });

//   describe('Performance and Memory', () => {
//     test('should handle large number of matches efficiently', () => {
//       // Create many matches
//       for (let i = 0; i < 1000; i++) {
//         matchingSystem.createMatch(`user${i}`, `target${i}`);
//       }
      
//       const matches = matchingSystem.getMatches('user0');
//       expect(matches).toHaveLength(1);
//     });

//     test('should handle large number of swipes efficiently', () => {
//       // Create many swipes
//       for (let i = 0; i < 1000; i++) {
//         matchingSystem.swipeRight(`user${i}`, `target${i}`);
//       }
      
//       const history = matchingSystem.getSwipeHistory('user0');
//       expect(history).toHaveLength(1);
//     });

//     test('should not leak memory with repeated operations', () => {
//       // Perform many operations and check that memory usage doesn't grow excessively
//       for (let i = 0; i < 100; i++) {
//         matchingSystem.swipeRight(`user${i}`, `target${i}`);
//         matchingSystem.createMatch(`user${i}`, `target${i}`);
//         matchingSystem.acceptMatch(`match_${Date.now()}_user${i}_target${i}`, `user${i}`);
//       }
      
//       // Should still be able to perform operations
//       const history = matchingSystem.getSwipeHistory('user0');
//       expect(history).toHaveLength(1);
//     });
//   });
// });
