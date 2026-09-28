/**
 * SHARED TYPE DEFINITIONS
 *
 * The client's data contract with the API. Every interface here mirrors a
 * Mongoose schema under server/models, with one deliberate difference: the
 * server's `toSafeObject()` renames `_id` to `id` and strips internal fields, so
 * these types describe the serialised form the client actually receives rather
 * than the raw document.
 *
 * Contents:
 *   - `UserData`    - a user profile (mirrors server/models/User.js).
 *   - `Preferences` - the embedded roommate-preference block, shared by users
 *                     and groups; the 1-5 scales are typed as literal unions so
 *                     an out-of-range value is a compile error.
 *   - `GroupData`   - a group profile (mirrors server/models/Group.js).
 *   - `Match`, `Message`, `GroupVote`, `SwipeAction` - the interaction records.
 *
 * Connections:
 *   - server/models/* - the schemas these mirror.
 *   - client/src/classes/*  - the domain classes built on these shapes.
 *   - client/src/components/*, services/authService.ts - consumers throughout.
 *
 * Notes:
 *   - These are hand-maintained rather than generated, so a schema change on the
 *     server must be reflected here by hand.
 *   - `UserStatus` at the foot of the file includes 'suspended', a value used by
 *     the client-side ProfileManager, whereas `UserData.status` uses the
 *     server's vocabulary ('individual' | 'in_group' | 'seeking_group'). The two
 *     were never reconciled.
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
  status?: 'individual' | 'in_group' | 'seeking_group';
  profileStatus?: 'active' | 'paused' | 'deactivated';
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
