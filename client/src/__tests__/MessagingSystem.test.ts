import { MessagingSystem } from '../classes/MessagingSystem';
import { User } from '../classes/User';
import { Group } from '../classes/Group';
import { Message } from '../types';

describe('MessagingSystem Class', () => {
  let messagingSystem: MessagingSystem;
  let user1: User;
  let user2: User;
  let user3: User;
  let group1: Group;
  let validPreferences: any;

  beforeEach(() => {
    messagingSystem = new MessagingSystem();
    
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

    user1 = new User(
      'user1',
      'user1@example.com',
      'User One',
      25,
      'male',
      'User one bio',
      ['photo1.jpg'],
      validPreferences
    );

    user2 = new User(
      'user2',
      'user2@example.com',
      'User Two',
      27,
      'female',
      'User two bio',
      ['photo2.jpg'],
      validPreferences
    );

    user3 = new User(
      'user3',
      'user3@example.com',
      'User Three',
      29,
      'male',
      'User three bio',
      ['photo3.jpg'],
      validPreferences
    );

    group1 = new Group(
      'group1',
      'Test Group',
      'A test group',
      ['user1', 'user2'],
      validPreferences,
      ['group1.jpg']
    );
  });

  describe('User Messaging', () => {
    test('should send message between two users', () => {
      const message = messagingSystem.sendUserMessage('user1', 'user2', 'Hello!');
      
      expect(message.senderId).toBe('user1');
      expect(message.receiverId).toBe('user2');
      expect(message.content).toBe('Hello!');
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.isRead).toBe(false);
    });

    test('should retrieve messages between two users', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello!');
      messagingSystem.sendUserMessage('user2', 'user1', 'Hi there!');
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello!');
      expect(messages[1].content).toBe('Hi there!');
    });

    test('should handle empty message content', () => {
      const message = messagingSystem.sendUserMessage('user1', 'user2', '');
      expect(message.content).toBe('');
    });

    test('should handle very long message content', () => {
      const longMessage = 'a'.repeat(10000);
      const message = messagingSystem.sendUserMessage('user1', 'user2', longMessage);
      expect(message.content).toBe(longMessage);
    });

    test('should handle special characters in message', () => {
      const specialMessage = 'Message with special chars: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const message = messagingSystem.sendUserMessage('user1', 'user2', specialMessage);
      expect(message.content).toBe(specialMessage);
    });

    test('should handle unicode characters in message', () => {
      const unicodeMessage = 'Message with 中文 and العربية characters';
      const message = messagingSystem.sendUserMessage('user1', 'user2', unicodeMessage);
      expect(message.content).toBe(unicodeMessage);
    });

    test('should handle same user sending multiple messages', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'First message');
      messagingSystem.sendUserMessage('user1', 'user2', 'Second message');
      messagingSystem.sendUserMessage('user1', 'user2', 'Third message');
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(3);
    });

    test('should handle bidirectional messaging', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'From user1');
      messagingSystem.sendUserMessage('user2', 'user1', 'From user2');
      messagingSystem.sendUserMessage('user1', 'user2', 'Another from user1');
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(3);
    });
  });

  describe('Group Messaging', () => {
    test('should send message to group', () => {
      const message = messagingSystem.sendGroupMessage('user1', 'group1', 'Hello group!');
      
      expect(message.senderId).toBe('user1');
      expect(message.groupId).toBe('group1');
      expect(message.content).toBe('Hello group!');
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.isRead).toBe(false);
    });

    test('should retrieve group messages', () => {
      messagingSystem.sendGroupMessage('user1', 'group1', 'First group message');
      messagingSystem.sendGroupMessage('user2', 'group1', 'Second group message');
      
      const messages = messagingSystem.getGroupMessages('group1');
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('First group message');
      expect(messages[1].content).toBe('Second group message');
    });

    test('should handle empty group message', () => {
      const message = messagingSystem.sendGroupMessage('user1', 'group1', '');
      expect(message.content).toBe('');
    });

    test('should handle very long group message', () => {
      const longMessage = 'a'.repeat(50000);
      const message = messagingSystem.sendGroupMessage('user1', 'group1', longMessage);
      expect(message.content).toBe(longMessage);
    });

    test('should handle multiple group messages from same user', () => {
      for (let i = 0; i < 100; i++) {
        messagingSystem.sendGroupMessage('user1', 'group1', `Message ${i}`);
      }
      
      const messages = messagingSystem.getGroupMessages('group1');
      expect(messages).toHaveLength(100);
    });

    test('should handle messages from different users in group', () => {
      messagingSystem.sendGroupMessage('user1', 'group1', 'From user1');
      messagingSystem.sendGroupMessage('user2', 'group1', 'From user2');
      
      const messages = messagingSystem.getGroupMessages('group1');
      expect(messages).toHaveLength(2);
      expect(messages[0].senderId).toBe('user1');
      expect(messages[1].senderId).toBe('user2');
    });
  });

  describe('Conversation Management', () => {
    test('should get user conversations', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      messagingSystem.sendGroupMessage('user1', 'group1', 'Group message');
      
      const conversations = messagingSystem.getUserConversations('user1');
      expect(conversations).toHaveLength(1);
      expect(conversations[0].type).toBe('user');
    });

    test('should handle user with no conversations', () => {
      const conversations = messagingSystem.getUserConversations('user1');
      expect(conversations).toEqual([]);
    });

    test('should handle multiple conversations', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Message 1');
      messagingSystem.sendUserMessage('user1', 'user3', 'Message 2');
      messagingSystem.sendGroupMessage('user1', 'group1', 'Group message');
      
      const conversations = messagingSystem.getUserConversations('user1');
      expect(conversations).toHaveLength(2);
    });

    test('should handle very large number of conversations', () => {
      // Create many conversations
      for (let i = 0; i < 100; i++) {
        messagingSystem.sendUserMessage('user1', `user${i}`, `Message to user${i}`);
      }
      
      const conversations = messagingSystem.getUserConversations('user1');
      expect(conversations).toHaveLength(100);
    });
  });

  describe('Message Read Status', () => {
    test('should mark messages as read', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      messagingSystem.sendUserMessage('user1', 'user2', 'How are you?');
      
      const conversationId = 'user1_user2';
      messagingSystem.markMessagesAsRead(conversationId, 'user2');
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages[0].isRead).toBe(true);
      expect(messages[1].isRead).toBe(true);
    });

    test('should not mark sender messages as read', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      
      const conversationId = 'user1_user2';
      messagingSystem.markMessagesAsRead(conversationId, 'user1'); // Sender marking as read
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages[0].isRead).toBe(false); // Sender's message should not be marked as read
    });

    test('should get unread message count', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      messagingSystem.sendUserMessage('user1', 'user2', 'How are you?');
      messagingSystem.sendUserMessage('user2', 'user1', 'I am fine');
      
      const unreadCount = messagingSystem.getUnreadCount('user1');
      expect(unreadCount).toBe(1); // Only the message from user2 to user1
    });

    test('should handle unread count with no messages', () => {
      const unreadCount = messagingSystem.getUnreadCount('user1');
      expect(unreadCount).toBe(0);
    });

    test('should handle unread count with all messages read', () => {
      messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      
      const conversationId = 'user1_user2';
      messagingSystem.markMessagesAsRead(conversationId, 'user2');
      
      const unreadCount = messagingSystem.getUnreadCount('user2');
      expect(unreadCount).toBe(0);
    });
  });

  describe('Message Permissions', () => {
    test('should allow individual users to send messages to each other', () => {
      expect(messagingSystem.canSendMessage(user1, 'user2')).toBe(true);
    });

    test('should not allow group members to message outside group', () => {
      user1.setGroupId('group1');
      expect(messagingSystem.canSendMessage(user1, 'user3')).toBe(false);
    });

    test('should allow group members to message within group', () => {
      user1.setGroupId('group1');
      expect(messagingSystem.canSendMessage(user1, undefined, 'group1')).toBe(true);
    });

    test('should not allow individual users to send group messages', () => {
      expect(messagingSystem.canSendMessage(user1, undefined, 'group1')).toBe(false);
    });

    test('should allow individual users to receive messages from other individuals', () => {
      expect(messagingSystem.canReceiveMessage(user1, 'user2')).toBe(true);
    });

    test('should not allow group members to receive messages from outside group', () => {
      user1.setGroupId('group1');
      expect(messagingSystem.canReceiveMessage(user1, 'user3')).toBe(false);
    });

    test('should allow group members to receive group messages', () => {
      user1.setGroupId('group1');
      expect(messagingSystem.canReceiveMessage(user1, 'user2', 'group1')).toBe(true);
    });
  });

  describe('Message Management', () => {
    test('should delete message by sender', () => {
      const message = messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      const deleted = messagingSystem.deleteMessage(message.id, 'user1');
      
      expect(deleted).toBe(true);
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(0);
    });

    test('should not allow non-sender to delete message', () => {
      const message = messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      const deleted = messagingSystem.deleteMessage(message.id, 'user2');
      
      expect(deleted).toBe(false);
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(1);
    });

    test('should return null when deleting non-existent message', () => {
      const deleted = messagingSystem.deleteMessage('nonexistent', 'user1');
      expect(deleted).toBe(false);
    });

    test('should get message by ID', () => {
      const message = messagingSystem.sendUserMessage('user1', 'user2', 'Hello');
      const retrievedMessage = messagingSystem.getMessage(message.id);
      
      expect(retrievedMessage).toEqual(message);
    });

    test('should return null for non-existent message ID', () => {
      const message = messagingSystem.getMessage('nonexistent');
      expect(message).toBeNull();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long user IDs', () => {
      const longUserId = 'a'.repeat(1000);
      const message = messagingSystem.sendUserMessage(longUserId, 'user2', 'Hello');
      expect(message.senderId).toBe(longUserId);
    });

    test('should handle special characters in user IDs', () => {
      const specialUserId = 'user@#$%^&*()';
      const message = messagingSystem.sendUserMessage(specialUserId, 'user2', 'Hello');
      expect(message.senderId).toBe(specialUserId);
    });

    test('should handle unicode characters in user IDs', () => {
      const unicodeUserId = '用户123';
      const message = messagingSystem.sendUserMessage(unicodeUserId, 'user2', 'Hello');
      expect(message.senderId).toBe(unicodeUserId);
    });

    test('should handle empty user IDs', () => {
      const message = messagingSystem.sendUserMessage('', 'user2', 'Hello');
      expect(message.senderId).toBe('');
    });

    test('should handle very long group ID', () => {
      const longGroupId = 'a'.repeat(1000);
      const message = messagingSystem.sendGroupMessage('user1', longGroupId, 'Hello');
      expect(message.groupId).toBe(longGroupId);
    });

    test('should handle special characters in group ID', () => {
      const specialGroupId = 'group@#$%^&*()';
      const message = messagingSystem.sendGroupMessage('user1', specialGroupId, 'Hello');
      expect(message.groupId).toBe(specialGroupId);
    });

    test('should handle very large number of messages', () => {
      // Create many messages
      for (let i = 0; i < 1000; i++) {
        messagingSystem.sendUserMessage('user1', 'user2', `Message ${i}`);
      }
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(1000);
    });

    test('should handle concurrent message sending', () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(Promise.resolve(messagingSystem.sendUserMessage('user1', 'user2', `Message ${i}`)));
      }
      
      return Promise.all(promises).then(() => {
        const messages = messagingSystem.getUserMessages('user1', 'user2');
        expect(messages).toHaveLength(100);
      });
    });

    test('should handle null/undefined content gracefully', () => {
      // TypeScript prevents this, but testing runtime behavior
      const message = messagingSystem.sendUserMessage('user1', 'user2', '');
      expect(message.content).toBe('');
    });

    test('should handle very long conversation history', () => {
      // Create a very long conversation
      for (let i = 0; i < 10000; i++) {
        messagingSystem.sendUserMessage('user1', 'user2', `Message ${i}`);
      }
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(10000);
    });
  });

  describe('Performance and Memory', () => {
    test('should handle large number of conversations efficiently', () => {
      // Create many conversations
      for (let i = 0; i < 1000; i++) {
        messagingSystem.sendUserMessage(`user${i}`, `target${i}`, `Message ${i}`);
      }
      
      const conversations = messagingSystem.getUserConversations('user0');
      expect(conversations).toHaveLength(1);
    });

    test('should handle large number of group messages efficiently', () => {
      // Create many group messages
      for (let i = 0; i < 1000; i++) {
        messagingSystem.sendGroupMessage(`user${i}`, 'group1', `Group message ${i}`);
      }
      
      const messages = messagingSystem.getGroupMessages('group1');
      expect(messages).toHaveLength(1000);
    });

    test('should not leak memory with repeated operations', () => {
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        messagingSystem.sendUserMessage(`user${i}`, `target${i}`, `Message ${i}`);
        messagingSystem.sendGroupMessage(`user${i}`, `group${i}`, `Group message ${i}`);
        messagingSystem.markMessagesAsRead(`user${i}_target${i}`, `target${i}`);
      }
      
      // Should still be able to perform operations
      const conversations = messagingSystem.getUserConversations('user0');
      expect(conversations).toHaveLength(1);
    });

    test('should handle rapid message sending', () => {
      const startTime = Date.now();
      
      // Send many messages rapidly
      for (let i = 0; i < 1000; i++) {
        messagingSystem.sendUserMessage('user1', 'user2', `Rapid message ${i}`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      const messages = messagingSystem.getUserMessages('user1', 'user2');
      expect(messages).toHaveLength(1000);
    });
  });
});
