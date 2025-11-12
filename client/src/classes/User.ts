/**
 * USER CLASS - Business logic and methods for user objects on the client side
 * Provides object-oriented interface for user data with validation and helper methods.
 * Handles user compatibility checking between potential roommates based on preferences.
 * Includes getters/setters for profile management and data conversion for API calls.
 * Maintains user status, group membership, and activity state with update timestamps.
 */
import { UserData, Preferences, UserStatus } from '../types';

export class User {
  private id: string;
  private email: string;
  private name: string;
  private age: number;
  private gender: 'male' | 'female' | 'non-binary' | 'other';
  private bio: string;
  private photos: string[];
  private isActive: boolean;
  private groupId?: string;
  private preferences: Preferences;
  private status: UserStatus;
  private createdAt: Date;
  private updatedAt: Date;

  constructor(
    id: string,
    email: string,
    name: string,
    age: number,
    gender: 'male' | 'female' | 'non-binary' | 'other',
    bio: string,
    photos: string[] = [],
    preferences: Preferences
  ) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.age = age;
    this.gender = gender;
    this.bio = bio;
    this.photos = photos;
    this.isActive = true;
    this.preferences = preferences;
    this.status = 'individual';
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  //Getters
  getId(): string { return this.id; }
  getEmail(): string { return this.email; }
  getName(): string { return this.name; }
  getAge(): number { return this.age; }
  getGender(): string { return this.gender; }
  getBio(): string { return this.bio; }
  getPhotos(): string[] { return this.photos; }
  getIsActive(): boolean { return this.isActive; }
  getGroupId(): string | undefined { return this.groupId; }
  getPreferences(): Preferences { return this.preferences; }
  getStatus(): UserStatus { return this.status; }
  getCreatedAt(): Date { return this.createdAt; }
  getUpdatedAt(): Date { return this.updatedAt; }

  //Setters
  setName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
  }

  setBio(bio: string): void {
    this.bio = bio;
    this.updatedAt = new Date();
  }

  setPhotos(photos: string[]): void {
    this.photos = photos;
    this.updatedAt = new Date();
  }

  setPreferences(preferences: Preferences): void {
    this.preferences = preferences;
    this.updatedAt = new Date();
  }

  setGroupId(groupId: string | undefined): void {
    this.groupId = groupId;
    this.updatedAt = new Date();
  }

  setStatus(status: UserStatus): void {
    this.status = status;
    this.updatedAt = new Date();
  }

  //Methods
  addPhoto(photoUrl: string): void {
    this.photos.push(photoUrl);
    this.updatedAt = new Date();
  }

  removePhoto(photoUrl: string): void {
    this.photos = this.photos.filter(photo => photo !== photoUrl);
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }

  //Check if user is compatible with another user's preferences
  isCompatibleWith(otherUser: User): boolean {
    const otherPrefs = otherUser.getPreferences();
    const myPrefs = this.preferences;

    //Check age compatibility
    if (this.age < otherPrefs.minAge || this.age > otherPrefs.maxAge) {
      return false;
    }
    if (otherUser.getAge() < myPrefs.minAge || otherUser.getAge() > myPrefs.maxAge) {
      return false;
    }

    //Check gender preference
    if (!otherPrefs.preferredGender.includes(this.gender)) {
      return false;
    }
    if (!myPrefs.preferredGender.includes(otherUser.getGender() as 'male' | 'female' | 'non-binary' | 'other')) {
      return false;
    }

    // // Check rent compatibility
    // if (myPrefs.maxRent < otherPrefs.maxRent) {
    //   return false;
    // }

    //Check cleanliness compatibility (within 2 levels)
    if (Math.abs(this.preferences.cleanlinessLevel - otherUser.getPreferences().cleanlinessLevel) > 2) {
      return false;
    }

    //Check noise tolerance compatibility (within 2 levels)
    if (Math.abs(this.preferences.noiseTolerance - otherUser.getPreferences().noiseTolerance) > 2) {
      return false;
    }

    //Check pet compatibility
    if (myPrefs.petFriendly !== otherPrefs.petFriendly) {
      return false;
    }

    //Check smoking compatibility
    if (myPrefs.smokingAllowed !== otherPrefs.smokingAllowed) {
      return false;
    }

    return true;
  }

  //Convert to plain object for API calls
  toJSON(): UserData {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      age: this.age,
      gender: this.gender,
      bio: this.bio,
      photos: this.photos,
      preferences: this.preferences,
      isActive: this.isActive,
      groupId: this.groupId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
