/**
 * MATCHING SYSTEM CLASS - Local matching and swipe action management
 * Handles in-memory storage of swipe actions and match generation.
 * Manages swipe left/right logic, mutual match detection, and potential match filtering.
 * Can work alongside API endpoints for hybrid local/remote functionality.
 */

import { User } from './User';
// import { Group } from './Group';
import { Match, SwipeAction } from '../types';

export class MatchingSystem {
  private matches: Map<string, Match[]> = new Map(); // userId -> matches
  private swipeActions: SwipeAction[] = [];

  //Swipe right (send a like) on a user
  swipeRight(swiperId: string, targetUserId: string): SwipeAction {
    const swipeAction: SwipeAction = {
      userId: swiperId,
      targetUserId,
      action: 'like',
      timestamp: new Date()
    };

    this.swipeActions.push(swipeAction);
    return swipeAction;
  }

  //Swipe left (pass) on a user
  swipeLeft(swiperId: string, targetUserId: string): SwipeAction {
    const swipeAction: SwipeAction = {
      userId: swiperId,
      targetUserId,
      action: 'pass',
      timestamp: new Date()
    };

    this.swipeActions.push(swipeAction);
    return swipeAction;
  }

  //Check if two users have matched (both swiped right on each other)
  checkForMatch(userId1: string, userId2: string): boolean {
    const user1LikedUser2 = this.swipeActions.some(
      action => action.userId === userId1 && action.targetUserId === userId2 && action.action === 'like'
    );
    
    const user2LikedUser1 = this.swipeActions.some(
      action => action.userId === userId2 && action.targetUserId === userId1 && action.action === 'like'
    );

    return user1LikedUser2 && user2LikedUser1;
  }

  //Create a match between two users
  createMatch(userId1: string, userId2: string): Match {
    const match: Match = {
      id: `match_${Date.now()}_${userId1}_${userId2}`,
      userId1,
      userId2,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    //Add to both users' match lists
    if (!this.matches.has(userId1)) {
      this.matches.set(userId1, []);
    }
    if (!this.matches.has(userId2)) {
      this.matches.set(userId2, []);
    }

    this.matches.get(userId1)!.push(match);
    this.matches.get(userId2)!.push(match);

    
    return match;
  }

  //Get all matches for a user
  getMatches(userId: string): Match[] {
    return this.matches.get(userId) || [];
  }

  //Get pending matches for a user
  getPendingMatches(userId: string): Match[] {
    return this.getMatches(userId).filter(match => match.status === 'pending');
  }

  //Accept a match
  acceptMatch(matchId: string, userId: string): Match | null {
    const userMatches = this.matches.get(userId);
    if (!userMatches) return null;

    const match = userMatches.find(m => m.id === matchId);
    if (!match) return null;

    match.status = 'accepted';
    match.updatedAt = new Date();

    return match;
  }

  //Reject a match
  rejectMatch(matchId: string, userId: string): Match | null {
    const userMatches = this.matches.get(userId);
    if (!userMatches) return null;

    const match = userMatches.find(m => m.id === matchId);
    if (!match) return null;

    match.status = 'rejected';
    match.updatedAt = new Date();

    return match;
  }

  //Mark match as group created
  markMatchAsGroupCreated(matchId: string, groupId: string): Match | null {
    //Find the match in all user match lists
    for (const [userId, matches] of this.matches.entries()) {
      const match = matches.find(m => m.id === matchId);
      if (match) {
        match.status = 'group_created';
        match.groupId = groupId;
        match.updatedAt = new Date();
        return match;
      }
    }
    return null;
  }

  //Get potential matches for a user based on compatibility
  getPotentialMatches(user: User, allUsers: User[] //, excludeIds: string[] = []
    ): User[] {
    return allUsers.filter(otherUser => {
      //Don't match with self
      if (otherUser.getId() === user.getId()) return false;
      
      // const compatibilityScore = user.isCompatibleWith(otherUser) ? "High" : "Low";

      // //Don't match with excluded users
      // if (excludeIds.includes(otherUser.getId())) return false;
      
      //Don't match with users who are already in groups
      if (otherUser.getGroupId()) return false;
      
      //Don't match with inactive users
      if (!otherUser.getIsActive()) return false;
      
      //Check compatibility
      // if (!user.isCompatibleWith(otherUser)) return false;
      
      //Check if already swiped on this user
      const alreadySwiped = this.swipeActions.some(
        action => action.userId === user.getId() && action.targetUserId === otherUser.getId()
      );
      
      return !alreadySwiped;
    });
  }

  //Get swipe history for a user
  getSwipeHistory(userId: string): SwipeAction[] {
    return this.swipeActions.filter(action => action.userId === userId);
  }

  //Get incoming likes for a user (who swiped right on this user)
  getIncomingLikes(userId: string): SwipeAction[] {
    return this.swipeActions.filter(action => 
      action.targetUserId === userId && action.action === 'like'
    );
  }

  //Check if user has already swiped on another user
  hasSwipedOn(userId: string, targetUserId: string): boolean {
    return this.swipeActions.some(
      action => action.userId === userId && action.targetUserId === targetUserId
    );
  }

  //Get the action taken on a specific user
  getSwipeAction(userId: string, targetUserId: string): SwipeAction | null {
    return this.swipeActions.find(
      action => action.userId === userId && action.targetUserId === targetUserId
    ) || null;
  }

  //Process all pending matches and create new ones
  processPendingMatches(): Match[] {
    const newMatches: Match[] = [];
    
    //Group swipe actions by user pairs
    const userPairs = new Map<string, { user1: string; user2: string; user1Action: SwipeAction; user2Action: SwipeAction }>();
    
    for (const action of this.swipeActions) {
      if (action.action === 'like') {
        //Check if the target user also liked this user
        const reverseAction = this.swipeActions.find(
          a => a.userId === action.targetUserId && a.targetUserId === action.userId && a.action === 'like'
        );
        
        if (reverseAction) {
          const pairKey = [action.userId, action.targetUserId].sort().join('_');
          if (!userPairs.has(pairKey)) {
            userPairs.set(pairKey, {
              user1: action.userId,
              user2: action.targetUserId,
              user1Action: action,
              user2Action: reverseAction
            });
          }
        }
      }
    }
    
    //Create matches for user pairs that haven't been matched yet to one another
    for (const [, pair] of userPairs) {
      const existingMatch = this.getMatches(pair.user1).find(
        match => (match.userId1 === pair.user1 && match.userId2 === pair.user2) ||
                 (match.userId1 === pair.user2 && match.userId2 === pair.user1)
      );
      
      if (!existingMatch) {
        const match = this.createMatch(pair.user1, pair.user2);
        newMatches.push(match);
      }
    }
    
    return newMatches;
  }
}
