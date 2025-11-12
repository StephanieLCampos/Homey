/**
 * TYPE DEFINITIONS - TypeScript interfaces for Homey app data structures
 * Defines data contracts for User, Group, Match, Message, and Preference objects.
 * Provides type safety for API responses, component props, and state management.
 * Includes user demographics, roommate preferences, match statuses, and messaging types.
 * Supports MongoDB document structure with ObjectId references and timestamps.
 */
export interface UserData {
  id: string;
  email: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'non-binary' | 'other';
  bio: string;
  photos: string[];
  preferences: Preferences;
  isActive: boolean;
  groupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Preferences {
  minAge: number;
  maxAge: number;
  preferredGender: ('male' | 'female' | 'non-binary' | 'other')[];
  maxRent: number;
  cleanlinessLevel: 1 | 2 | 3 | 4 | 5; // 1 = very messy, 5 = very clean
  noiseTolerance: 1 | 2 | 3 | 4 | 5; // 1 = very quiet, 5 = very loud
  petFriendly: boolean;
  smokingAllowed: boolean;
  location: {
    city: string;
    state: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
}

export interface GroupData {
  id: string;
  name: string;
  description: string;
  memberIds: string[];
  preferences: Preferences;
  photos: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Match {
  id: string;
  userId1: string;
  userId2: string;
  groupId?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'group_created';
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId?: string;
  groupId?: string;
  content: string;
  timestamp: Date;
  isRead: boolean;
}

export interface GroupVote {
  id: string;
  groupId: string;
  proposedUserId: string;
  voterId: string;
  vote: 'yes' | 'no';
  createdAt: Date;
}

export interface SwipeAction {
  userId: string;
  targetUserId: string;
  action: 'like' | 'pass';
  timestamp: Date;
}

export type UserStatus = 'individual' | 'in_group' | 'suspended';
export type GroupRole = 'admin' | 'member';
