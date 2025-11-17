/**
 * MESSAGING SYSTEM CLASS - Local messaging and conversation management
 * Handles in-memory message storage and conversation threading.
 * Manages user-to-user and group messaging with Maps for conversation organization.
 * Can work alongside API endpoints for hybrid local/remote functionality.
 */

import { Message } from '../types';
import { User } from './User';
// import { Group } from './Group';

export class MessagingSystem {
  private messages: Map<string, Message[]> = new Map(); //this maps the conversationID to an array of messages
  private userConversations: Map<string, string[]> = new Map(); //this maps the UserID to the conversationID
  private groupConversations: Map<string, string[]> = new Map(); //this maps the groupID to the conversationID

  //Sends a message between two users
  sendUserMessage(senderId: string, receiverId: string, content: string): Message {
    const conversationId = this.getConversationId(senderId, receiverId);
    
    const message: Message = {
      id: `msg_${Date.now()}_${senderId}`,
      senderId,
      receiverId,
      content,
      timestamp: new Date(),
      isRead: false
    };

    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }

    this.messages.get(conversationId)!.push(message);

    //Updates user conversations
    this.addToUserConversations(senderId, conversationId);
    this.addToUserConversations(receiverId, conversationId);

    return message;
  }

  //Sends a message to a group
  sendGroupMessage(senderId: string, groupId: string, content: string): Message {
    const conversationId = `group_${groupId}`;
    
    const message: Message = {
      id: `msg_${Date.now()}_${senderId}`,
      senderId,
      groupId,
      content,
      timestamp: new Date(),
      isRead: false
    };

    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }

    this.messages.get(conversationId)!.push(message);

    //Updates group conversations
    this.addToGroupConversations(groupId, conversationId);

    return message;
  }

  //Gets messages between two users
  getUserMessages(userId1: string, userId2: string): Message[] {
    const conversationId = this.getConversationId(userId1, userId2);
    return this.messages.get(conversationId) || [];
  }

  //Gets messages for a group
  getGroupMessages(groupId: string): Message[] {
    const conversationId = `group_${groupId}`;
    return this.messages.get(conversationId) || [];
  }

  //Gets all conversations for a user
  getUserConversations(userId: string): { conversationId: string; messages: Message[]; type: 'user' | 'group' }[] {
    const conversationIds = this.userConversations.get(userId) || [];
    const groupConversationIds = this.groupConversations.get(userId) || [];
    
    const conversations: { conversationId: string; messages: Message[]; type: 'user' | 'group' }[] = [];
    
    //Adds user conversations
    for (const conversationId of conversationIds) {
      const messages = this.messages.get(conversationId) || [];
      conversations.push({
        conversationId,
        messages,
        type: 'user'
      });
    }
    
    //Adds group conversations
    for (const conversationId of groupConversationIds) {
      const messages = this.messages.get(conversationId) || [];
      conversations.push({
        conversationId,
        messages,
        type: 'group'
      });
    }
    
    return conversations;
  }

  //Marks messages as read
  markMessagesAsRead(conversationId: string, userId: string): void {
    const messages = this.messages.get(conversationId);
    if (!messages) return;

    messages.forEach(message => {
      if (message.receiverId === userId || (message.groupId && !message.isRead)) {
        message.isRead = true;
      }
    });
  }

  //Gets unread message count for a user
  getUnreadCount(userId: string): number {
    let unreadCount = 0;
    
    for (const [, messages] of this.messages.entries()) {
      for (const message of messages) {
        if ((message.receiverId === userId || (message.groupId && this.isUserInGroup(userId, message.groupId))) && !message.isRead) {
          unreadCount++;
        }
      }
    }
    
    return unreadCount;
  }

  //Checks if user can send messages meaning they are not in a group or are messaging within their group
  canSendMessage(sender: User, receiverId?: string, groupId?: string): boolean {
    //If user is in a group, they can only message within that group, and no one else
    if (sender.getGroupId()) {
      if (groupId && groupId === sender.getGroupId()) {
        return true; //Can message within their group
      }
      return false; //Cannot message outside their group
    }
    
    //If user is not in a group, they can message other individual users
    if (receiverId && !groupId) {
      return true;
    }
    
    return false;
  }

  //Check if user can receive messages from another user
  canReceiveMessage(receiver: User, _senderId: string, groupId?: string): boolean {
    //If receiver user is in a group, they can only receive messages from group members
    if (receiver.getGroupId()) {
      if (groupId && groupId === receiver.getGroupId()) {
        return true; //user receives group messages
      }
      return false; 
    }
    
    //If receiver user is not in a group, they can receive messages from other individual users (other matches they had)
    if (!groupId) {
      return true;
    }
    
    return false;
  }

  //Private helper methods
  private getConversationId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join('_');
  }

  private addToUserConversations(userId: string, conversationId: string): void {
    if (!this.userConversations.has(userId)) {
      this.userConversations.set(userId, []);
    }
    
    const conversations = this.userConversations.get(userId)!;
    if (!conversations.includes(conversationId)) {
      conversations.push(conversationId);
    }
  }

  private addToGroupConversations(groupId: string, conversationId: string): void {
    if (!this.groupConversations.has(groupId)) {
      this.groupConversations.set(groupId, []);
    }
    
    const conversations = this.groupConversations.get(groupId)!;
    if (!conversations.includes(conversationId)) {
      conversations.push(conversationId);
    }
  }

  private isUserInGroup(_userId: string, _groupId: string): boolean {
    //better implementation would check actual group membership
    return true; 
  }

  //Delete a message
  deleteMessage(messageId: string, userId: string): boolean {
    for (const [, messages] of this.messages.entries()) {
      const messageIndex = messages.findIndex(msg => msg.id === messageId);
      if (messageIndex >= 0) {
        const message = messages[messageIndex];
        //Only allow deletion of message if user is the sender
        if (message.senderId === userId) {
          messages.splice(messageIndex, 1);
          return true;
        }
      }
    }
    return false;
  }

  //Get message by ID
  getMessage(messageId: string): Message | null {
    for (const [, messages] of this.messages.entries()) {
      const message = messages.find(msg => msg.id === messageId);
      if (message) {
        return message;
      }
    }
    return null;
  }
}
