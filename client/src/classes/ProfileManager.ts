/**
 * PROFILE MANAGER CLASS - Local storage management for users and groups
 * Handles in-memory user and group storage using JavaScript Maps.
 * Provides business logic for user creation, group formation, member management, and profile searching.
 * Can work alongside API endpoints for hybrid local/remote functionality.
 */

import { User } from './User';
import { Group } from './Group';
import { Preferences } from '../types';

export class ProfileManager {
  private users: Map<string, User> = new Map();
  private groups: Map<string, Group> = new Map();

  //User management
  createUser(
    id: string,
    email: string,
    name: string,
    age: number,
    gender: 'male' | 'female' | 'non-binary' | 'other',
    bio: string,
    photos: string[] = [],
    preferences: Preferences
  ): User {
    const user = new User(id, email, name, age, gender, bio, photos, preferences);
    this.users.set(id, user);
    return user;
  }

  getUser(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  updateUser(userId: string, updates: Partial<{
    name: string;
    bio: string;
    photos: string[];
    preferences: Preferences;
  }>): User | null {
    const user = this.users.get(userId);
    if (!user) return null;

    if (updates.name) user.setName(updates.name);
    if (updates.bio) user.setBio(updates.bio);
    if (updates.photos) user.setPhotos(updates.photos);
    if (updates.preferences) user.setPreferences(updates.preferences);

    return user;
  }

  deleteUser(userId: string): boolean {
    return this.users.delete(userId);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  getActiveUsers(): User[] {
    return this.getAllUsers().filter(user => user.getIsActive());
  }

  getIndividualUsers(): User[] {
    return this.getActiveUsers().filter(user => !user.getGroupId());
  }

  //Group management

  createGroup(
    id: string,
    name: string,
    description: string,
    memberIds: string[],
    preferences: Preferences,
    photos: string[] = []
  ): Group {
    const group = new Group(id, name, description, memberIds, preferences, photos);
    this.groups.set(id, group);
    
    //Update member users to be in the group 
    memberIds.forEach(userId => {
      const user = this.users.get(userId);
      if (user) {
        user.setGroupId(id);
        // user.setStatus('in_group');
        user.deactivate();
        user.setStatus('in_group');
      }
    });

    return group;
  }

  getGroup(groupId: string): Group | null {
    return this.groups.get(groupId) || null;
  }

  updateGroup(groupId: string, updates: Partial<{
    name: string;
    description: string;
    preferences: Preferences;
    photos: string[];
  }>): Group | null {
    const group = this.groups.get(groupId);
    if (!group) return null;

    if (updates.name) group.setName(updates.name);
    if (updates.description) group.setDescription(updates.description);
    if (updates.preferences) group.setPreferences(updates.preferences);
    if (updates.photos) group.setPhotos(updates.photos);

    return group;
  }

  deleteGroup(groupId: string): boolean {
    const group = this.groups.get(groupId);
    if (!group) return false;

    //Reactivate individual users when group is deleted
    group.getMemberIds().forEach(userId => {
      const user = this.users.get(userId);
      if (user) {
        user.setGroupId(undefined);
        user.setStatus('individual');
      }
    });

    return this.groups.delete(groupId);
  }

  getAllGroups(): Group[] {
    return Array.from(this.groups.values());
  }

  getActiveGroups(): Group[] {
    return this.getAllGroups().filter(group => group.getIsActive());
  }

  //Merge individual profiles into a group profile
  mergeProfilesIntoGroup(
    groupId: string,
    name: string,
    description: string,
    memberIds: string[],
    preferences: Preferences,
    photos: string[] = []
  ): Group {
    // Create the group
    const group = this.createGroup(groupId, name, description, memberIds, preferences, photos);

    // Suspend individual profiles (mark as inactive)
    memberIds.forEach(userId => {
      const user = this.users.get(userId);
      if (user) {
        user.deactivate();
        user.setStatus('suspended');
      }
    });

    return group;
  }

  //Add member to existing group
  addMemberToGroup(groupId: string, userId: string): boolean {
    const group = this.groups.get(groupId);
    const user = this.users.get(userId);
    
    if (!group || !user) return false;

    // //Check if user is compatible with group
    // if (!group.isCompatibleWithUser(user)) return false;

    //Add user to group
    group.addMember(userId);
    user.setGroupId(groupId);
    // user.setStatus('in_group');
    user.setStatus('suspended');  // suspended not in_group
    user.deactivate(); // Suspend individual profile

    return true;
  }

  //Remove member from group
  removeMemberFromGroup(groupId: string, userId: string): boolean {
    const group = this.groups.get(groupId);
    const user = this.users.get(userId);
    
    if (!group || !user) return false;

    //Remove user
    group.removeMember(userId);
    user.setGroupId(undefined);
    user.setStatus('individual');
    user.activate(); //Reactivate individual profile of user

    return true;
  }

  //Get group members
  getGroupMembers(groupId: string): User[] {
    const group = this.groups.get(groupId);
    if (!group) return [];

    return group.getMemberIds()
      .map(userId => this.users.get(userId))
      .filter((user): user is User => user !== null);
  }

  //Check if user is in a group
  isUserInGroup(userId: string): boolean {
    const user = this.users.get(userId);
    return user ? !!user.getGroupId() : false;
  }

  //Get user's group
  getUserGroup(userId: string): Group | null {
    const user = this.users.get(userId);
    if (!user || !user.getGroupId()) return null;
    
    return this.groups.get(user.getGroupId()!) || null;
  }

  //Search users by criteria
  searchUsers(criteria: {
    minAge?: number;
    maxAge?: number;
    gender?: string;
    maxRent?: number;
    cleanlinessLevel?: number;
    noiseTolerance?: number;
    petFriendly?: boolean;
    smokingAllowed?: boolean;
    location?: string;
  }): User[] {
    return this.getIndividualUsers().filter(user => {
      const prefs = user.getPreferences();
      
      if (criteria.minAge && user.getAge() < criteria.minAge) return false;
      if (criteria.maxAge && user.getAge() > criteria.maxAge) return false;
      if (criteria.gender && user.getGender() !== criteria.gender) return false;
      // if (criteria.maxRent && prefs.maxRent > criteria.maxRent) return false;
      if (criteria.cleanlinessLevel && prefs.cleanlinessLevel < criteria.cleanlinessLevel) return false;
      if (criteria.noiseTolerance && prefs.noiseTolerance < criteria.noiseTolerance) return false;
      if (criteria.petFriendly !== undefined && prefs.petFriendly !== criteria.petFriendly) return false;
      if (criteria.smokingAllowed !== undefined && prefs.smokingAllowed !== criteria.smokingAllowed) return false;
      if (criteria.location && prefs.location.city.toLowerCase() !== criteria.location.toLowerCase()) return false;
      
      return true;
    });
  }

  //Get stats
  getStats(): {
    totalUsers: number;
    activeUsers: number;
    individualUsers: number;
    usersInGroups: number;
    totalGroups: number;
    activeGroups: number;
  } {
    const allUsers = this.getAllUsers();
    const activeUsers = this.getActiveUsers();
    const individualUsers = this.getIndividualUsers();
    const usersInGroups = activeUsers.filter(user => user.getGroupId()).length;
    const allGroups = this.getAllGroups();
    const activeGroups = this.getActiveGroups();

    return {
      totalUsers: allUsers.length,
      activeUsers: activeUsers.length,
      individualUsers: individualUsers.length,
      usersInGroups,
      totalGroups: allGroups.length,
      activeGroups: activeGroups.length
    };
  }
}
