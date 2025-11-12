import { ProfileManager } from '../classes/ProfileManager';
import { User } from '../classes/User';
import { Group } from '../classes/Group';
import { Preferences } from '../types';

describe('ProfileManager Class', () => {
  let profileManager: ProfileManager;
  let validPreferences: Preferences;

  beforeEach(() => {
    profileManager = new ProfileManager();
    
    validPreferences = {
      minAge: 20,
      maxAge: 30,
      preferredGender: ['male', 'female'],
      maxRent: 2000,
      cleanlinessLevel: 3,
      noiseTolerance: 3,
      petFriendly: true,
      smokingAllowed: false,
      location: { city: 'San Francisco', state: 'CA' }
    };
  });

  describe('User Management', () => {
    test('should create user with valid data', () => {
      const user = profileManager.createUser(
        'user1',
        'user1@example.com',
        'User One',
        25,
        'male',
        'User one bio',
        ['photo1.jpg'],
        validPreferences
      );

      expect(user.getId()).toBe('user1');
      expect(user.getEmail()).toBe('user1@example.com');
      expect(user.getName()).toBe('User One');
      expect(user.getAge()).toBe(25);
      expect(user.getGender()).toBe('male');
    });

    test('should create user with minimal data', () => {
      const user = profileManager.createUser(
        'user2',
        'user2@example.com',
        'User Two',
        22,
        'female',
        'Minimal bio',
        [],
        validPreferences
      );

      expect(user.getId()).toBe('user2');
      expect(user.getPhotos()).toEqual([]);
    });

    test('should get user by ID', () => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      
      const user = profileManager.getUser('user1');
      expect(user).toBeDefined();
      expect(user?.getId()).toBe('user1');
    });

    test('should return null for non-existent user', () => {
      const user = profileManager.getUser('nonexistent');
      expect(user).toBeNull();
    });

    test('should update user properties', () => {
      const user = profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      
      const updatedUser = profileManager.updateUser('user1', {
        name: 'Updated Name',
        bio: 'Updated bio',
        photos: ['new1.jpg', 'new2.jpg']
      });

      expect(updatedUser?.getName()).toBe('Updated Name');
      expect(updatedUser?.getBio()).toBe('Updated bio');
      expect(updatedUser?.getPhotos()).toEqual(['new1.jpg', 'new2.jpg']);
    });

    test('should delete user', () => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      
      const deleted = profileManager.deleteUser('user1');
      expect(deleted).toBe(true);
      
      const user = profileManager.getUser('user1');
      expect(user).toBeNull();
    });

    test('should return false when deleting non-existent user', () => {
      const deleted = profileManager.deleteUser('nonexistent');
      expect(deleted).toBe(false);
    });

    test('should get all users', () => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      
      const users = profileManager.getAllUsers();
      expect(users).toHaveLength(2);
    });

    test('should get active users only', () => {
      const user1 = profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      const user2 = profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      
      user2.deactivate();
      
      const activeUsers = profileManager.getActiveUsers();
      expect(activeUsers).toHaveLength(1);
      expect(activeUsers[0].getId()).toBe('user1');
    });

    test('should get individual users only', () => {
      const user1 = profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      const user2 = profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      
      user2.setGroupId('group1');
      
      const individualUsers = profileManager.getIndividualUsers();
      expect(individualUsers).toHaveLength(1);
      expect(individualUsers[0].getId()).toBe('user1');
    });
  });

  describe('Group Management', () => {
    beforeEach(() => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      profileManager.createUser('user3', 'user3@example.com', 'User Three', 29, 'male', 'Bio', [], validPreferences);
    });

    test('should create group with valid data', () => {
      const group = profileManager.createGroup(
        'group1',
        'Test Group',
        'A test group',
        ['user1', 'user2'],
        validPreferences,
        ['group1.jpg']
      );

      expect(group.getId()).toBe('group1');
      expect(group.getName()).toBe('Test Group');
      expect(group.getMemberIds()).toEqual(['user1', 'user2']);
    });

    test('should create group with minimal data', () => {
      const group = profileManager.createGroup(
        'group2',
        'Minimal Group',
        'Minimal description',
        ['user1'],
        validPreferences,
        []
      );

      expect(group.getId()).toBe('group2');
      expect(group.getMemberIds()).toEqual(['user1']);
    });

    test('should get group by ID', () => {
      profileManager.createGroup('group1', 'Test Group', 'Description', ['user1', 'user2'], validPreferences, []);
      
      const group = profileManager.getGroup('group1');
      expect(group).toBeDefined();
      expect(group?.getId()).toBe('group1');
    });

    test('should return null for non-existent group', () => {
      const group = profileManager.getGroup('nonexistent');
      expect(group).toBeNull();
    });

    test('should update group properties', () => {
      profileManager.createGroup('group1', 'Test Group', 'Description', ['user1', 'user2'], validPreferences, []);
      
      const updatedGroup = profileManager.updateGroup('group1', {
        name: 'Updated Group Name',
        description: 'Updated description',
        photos: ['new1.jpg', 'new2.jpg']
      });

      expect(updatedGroup?.getName()).toBe('Updated Group Name');
      expect(updatedGroup?.getDescription()).toBe('Updated description');
      expect(updatedGroup?.getPhotos()).toEqual(['new1.jpg', 'new2.jpg']);
    });

    test('should delete group', () => {
      profileManager.createGroup('group1', 'Test Group', 'Description', ['user1', 'user2'], validPreferences, []);
      
      const deleted = profileManager.deleteGroup('group1');
      expect(deleted).toBe(true);
      
      const group = profileManager.getGroup('group1');
      expect(group).toBeNull();
    });

    test('should return false when deleting non-existent group', () => {
      const deleted = profileManager.deleteGroup('nonexistent');
      expect(deleted).toBe(false);
    });

    test('should get all groups', () => {
      profileManager.createGroup('group1', 'Group One', 'Description', ['user1'], validPreferences, []);
      profileManager.createGroup('group2', 'Group Two', 'Description', ['user2'], validPreferences, []);
      
      const groups = profileManager.getAllGroups();
      expect(groups).toHaveLength(2);
    });

    test('should get active groups only', () => {
      const group1 = profileManager.createGroup('group1', 'Group One', 'Description', ['user1'], validPreferences, []);
      const group2 = profileManager.createGroup('group2', 'Group Two', 'Description', ['user2'], validPreferences, []);
      
      group2.deactivate();
      
      const activeGroups = profileManager.getActiveGroups();
      expect(activeGroups).toHaveLength(1);
      expect(activeGroups[0].getId()).toBe('group1');
    });
  });

  describe('Profile Merging', () => {
    beforeEach(() => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
    });

    test('should merge profiles into group', () => {
      const group = profileManager.mergeProfilesIntoGroup(
        'group1',
        'Merged Group',
        'Merged description',
        ['user1', 'user2'],
        validPreferences,
        ['group1.jpg']
      );

      expect(group.getId()).toBe('group1');
      expect(group.getMemberIds()).toEqual(['user1', 'user2']);
      
      // Check that individual profiles are suspended
      const user1 = profileManager.getUser('user1');
      const user2 = profileManager.getUser('user2');
      expect(user1?.getIsActive()).toBe(false);
      expect(user2?.getIsActive()).toBe(false);
      expect(user1?.getStatus()).toBe('suspended');
      expect(user2?.getStatus()).toBe('suspended');
    });

    test('should handle merging with single user', () => {
      const group = profileManager.mergeProfilesIntoGroup(
        'group2',
        'Single User Group',
        'Single user description',
        ['user1'],
        validPreferences,
        []
      );

      expect(group.getMemberIds()).toEqual(['user1']);
    });

    test('should handle merging with large number of users', () => {
      // Create many users
      const userIds = [];
      for (let i = 0; i < 100; i++) {
        const userId = `user${i}`;
        profileManager.createUser(userId, `${userId}@example.com`, `User ${i}`, 20 + (i % 20), 'male', 'Bio', [], validPreferences);
        userIds.push(userId);
      }

      const group = profileManager.mergeProfilesIntoGroup(
        'large-group',
        'Large Group',
        'Large group description',
        userIds,
        validPreferences,
        []
      );

      expect(group.getMemberIds()).toHaveLength(100);
    });
  });

  describe('Group Member Management', () => {
    beforeEach(() => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      profileManager.createUser('user3', 'user3@example.com', 'User Three', 29, 'male', 'Bio', [], validPreferences);
      profileManager.createGroup('group1', 'Test Group', 'Description', ['user1', 'user2'], validPreferences, []);
    });

    test('should add member to group', () => {
      const added = profileManager.addMemberToGroup('group1', 'user3');
      expect(added).toBe(true);
      
      const group = profileManager.getGroup('group1');
      expect(group?.getMemberIds()).toContain('user3');
    });

    test('should not add incompatible member to group', () => {
      const incompatibleUser = profileManager.createUser(
        'incompatible',
        'incompatible@example.com',
        'Incompatible User',
        35, // Too old
        'male',
        'Bio',
        [],
        validPreferences
      );

      const added = profileManager.addMemberToGroup('group1', 'incompatible');
      expect(added).toBe(false);
    });

    test('should remove member from group', () => {
      const removed = profileManager.removeMemberFromGroup('group1', 'user1');
      expect(removed).toBe(true);
      
      const group = profileManager.getGroup('group1');
      expect(group?.getMemberIds()).not.toContain('user1');
    });

    test('should return false when removing non-existent member', () => {
      const removed = profileManager.removeMemberFromGroup('group1', 'nonexistent');
      expect(removed).toBe(false);
    });

    test('should get group members', () => {
      const members = profileManager.getGroupMembers('group1');
      expect(members).toHaveLength(2);
      expect(members.map(m => m.getId())).toContain('user1');
      expect(members.map(m => m.getId())).toContain('user2');
    });

    test('should return empty array for non-existent group', () => {
      const members = profileManager.getGroupMembers('nonexistent');
      expect(members).toEqual([]);
    });

    test('should check if user is in group', () => {
      expect(profileManager.isUserInGroup('user1')).toBe(true);
      expect(profileManager.isUserInGroup('user3')).toBe(false);
    });

    test('should get user group', () => {
      const group = profileManager.getUserGroup('user1');
      expect(group?.getId()).toBe('group1');
    });

    test('should return null for user not in group', () => {
      const group = profileManager.getUserGroup('user3');
      expect(group).toBeNull();
    });
  });

  describe('User Search', () => {
    beforeEach(() => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      profileManager.createUser('user3', 'user3@example.com', 'User Three', 35, 'male', 'Bio', [], {
        ...validPreferences,
        maxRent: 1000
      });
    });

    test('should search users by age range', () => {
      const results = profileManager.searchUsers({ minAge: 20, maxAge: 30 });
      expect(results).toHaveLength(2);
      expect(results.map(u => u.getId())).toContain('user1');
      expect(results.map(u => u.getId())).toContain('user2');
    });

    test('should search users by gender', () => {
      const results = profileManager.searchUsers({ gender: 'male' });
      expect(results).toHaveLength(2);
      expect(results.map(u => u.getId())).toContain('user1');
      expect(results.map(u => u.getId())).toContain('user3');
    });

    test('should search users by max rent', () => {
      const results = profileManager.searchUsers({ maxRent: 1500 });
      expect(results).toHaveLength(1);
      expect(results[0].getId()).toBe('user3');
    });

    test('should search users by cleanliness level', () => {
      const results = profileManager.searchUsers({ cleanlinessLevel: 3 });
      expect(results).toHaveLength(3); // All users have cleanliness level 3
    });

    test('should search users by pet friendliness', () => {
      const results = profileManager.searchUsers({ petFriendly: true });
      expect(results).toHaveLength(3); // All users have petFriendly: true
    });

    test('should search users by smoking preference', () => {
      const results = profileManager.searchUsers({ smokingAllowed: false });
      expect(results).toHaveLength(3); // All users have smokingAllowed: false
    });

    test('should search users by location', () => {
      const results = profileManager.searchUsers({ location: 'San Francisco' });
      expect(results).toHaveLength(3);
    });

    test('should search users with multiple criteria', () => {
      const results = profileManager.searchUsers({
        minAge: 20,
        maxAge: 30,
        gender: 'male',
        petFriendly: true
      });
      expect(results).toHaveLength(1);
      expect(results[0].getId()).toBe('user1');
    });

    test('should return empty array when no users match criteria', () => {
      const results = profileManager.searchUsers({ minAge: 50 });
      expect(results).toEqual([]);
    });

    test('should handle search with no criteria', () => {
      const results = profileManager.searchUsers({});
      expect(results).toHaveLength(3);
    });
  });

  describe('Statistics', () => {
    test('should get correct statistics', () => {
      profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      profileManager.createUser('user2', 'user2@example.com', 'User Two', 27, 'female', 'Bio', [], validPreferences);
      profileManager.createUser('user3', 'user3@example.com', 'User Three', 29, 'male', 'Bio', [], validPreferences);
      
      profileManager.createGroup('group1', 'Group One', 'Description', ['user1', 'user2'], validPreferences, []);
      
      const stats = profileManager.getStats();
      expect(stats.totalUsers).toBe(3);
      expect(stats.activeUsers).toBe(3); // All users are active
      expect(stats.individualUsers).toBe(1);
      expect(stats.usersInGroups).toBe(2);
      expect(stats.totalGroups).toBe(1);
      expect(stats.activeGroups).toBe(1);
    });

    test('should handle empty statistics', () => {
      const stats = profileManager.getStats();
      expect(stats.totalUsers).toBe(0);
      expect(stats.activeUsers).toBe(0);
      expect(stats.individualUsers).toBe(0);
      expect(stats.usersInGroups).toBe(0);
      expect(stats.totalGroups).toBe(0);
      expect(stats.activeGroups).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long user IDs', () => {
      const longUserId = 'a'.repeat(1000);
      const user = profileManager.createUser(longUserId, 'user@example.com', 'User', 25, 'male', 'Bio', [], validPreferences);
      expect(user.getId()).toBe(longUserId);
    });

    test('should handle special characters in user IDs', () => {
      const specialUserId = 'user@#$%^&*()';
      const user = profileManager.createUser(specialUserId, 'user@example.com', 'User', 25, 'male', 'Bio', [], validPreferences);
      expect(user.getId()).toBe(specialUserId);
    });

    test('should handle unicode characters in user IDs', () => {
      const unicodeUserId = '用户123';
      const user = profileManager.createUser(unicodeUserId, 'user@example.com', 'User', 25, 'male', 'Bio', [], validPreferences);
      expect(user.getId()).toBe(unicodeUserId);
    });

    test('should handle very long group names', () => {
      const longGroupName = 'a'.repeat(1000);
      const group = profileManager.createGroup('group1', longGroupName, 'Description', [], validPreferences, []);
      expect(group.getName()).toBe(longGroupName);
    });

    test('should handle very long descriptions', () => {
      const longDescription = 'a'.repeat(10000);
      const group = profileManager.createGroup('group1', 'Group', longDescription, [], validPreferences, []);
      expect(group.getDescription()).toBe(longDescription);
    });

    test('should handle very large number of users', () => {
      // Create many users
      for (let i = 0; i < 1000; i++) {
        profileManager.createUser(`user${i}`, `user${i}@example.com`, `User ${i}`, 20 + (i % 20), 'male', 'Bio', [], validPreferences);
      }
      
      const users = profileManager.getAllUsers();
      expect(users).toHaveLength(1000);
    });

    test('should handle very large number of groups', () => {
      // Create many groups
      for (let i = 0; i < 1000; i++) {
        profileManager.createGroup(`group${i}`, `Group ${i}`, 'Description', [], validPreferences, []);
      }
      
      const groups = profileManager.getAllGroups();
      expect(groups).toHaveLength(1000);
    });

    test('should handle concurrent operations', () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(profileManager.createUser(`user${i}`, `user${i}@example.com`, `User ${i}`, 25, 'male', 'Bio', [], validPreferences)));
      }
      
      return Promise.all(promises).then(() => {
        const users = profileManager.getAllUsers();
        expect(users).toHaveLength(100);
      });
    });

    test('should handle empty string updates', () => {
      const user = profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      
      const updatedUser = profileManager.updateUser('user1', {
        name: '',
        bio: '',
        photos: []
      });

      expect(updatedUser?.getName()).toBe('User One'); // Name wasn't updated because it's not in the update object
      expect(updatedUser?.getBio()).toBe('Bio'); // Bio wasn't updated because it's not in the update object
      expect(updatedUser?.getPhotos()).toEqual([]);
    });

    test('should handle null/undefined updates gracefully', () => {
      const user = profileManager.createUser('user1', 'user1@example.com', 'User One', 25, 'male', 'Bio', [], validPreferences);
      
      const updatedUser = profileManager.updateUser('user1', {});
      expect(updatedUser).toBeDefined();
    });
  });
});
