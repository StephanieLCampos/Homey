/**
 * GROUP CLASS
 *
 * Client-side domain model for a roommate group: its shared profile, its member
 * list, and the voting state used to admit new members.
 *
 * `pendingVotes` maps a proposed user's id to the ballots cast on them, which
 * mirrors the `pendingVotes` Map on the server's Group schema. The rule
 * implemented here is a simple majority of current members
 * (`ceil(memberCount / 2)`), with `getVotingStatus` exposing the running tally
 * for display.
 *
 * Connections:
 *   - client/src/types/index.ts   - `GroupData`, `Preferences`, `GroupVote`.
 *   - client/src/classes/User.ts  - members, and the subject of compatibility checks.
 *   - client/src/classes/User.ts - members, and the subject of compatibility checks.
 *   - client/src/__tests__/Group.test.ts - its 55-test suite, the only consumer.
 *   - server/models/Group.js - the authoritative server-side equivalent.
 *   - client/src/__tests__/Group.test.ts   - unit tests.
 *   - server/models/Group.js      - the authoritative server-side equivalent.
 *
 * STATUS: not wired into the running application. The UI receives group data from
 * the API as plain JSON and stores it untyped, and the group rules are enforced
 * server-side by server/models/Group.js and the /propose and /vote endpoints in
 * server/index.js. An unused import of this class in App.tsx was removed.
 *
 * It is retained deliberately, as the clearest executable statement of the
 * voting rules - the server implements the same majority threshold across a
 * schema, a Map field and two endpoints, whereas the version here can be read in
 * one sitting and is covered by 55 unit tests.
 *
 * Notes:
 *   - This class holds no capacity limit; `maxMembers` and the full/paused
 *     status flags live only on the server model.
 *   - Votes are keyed by an id derived from `Date.now()` and the voter, which is
 *     adequate here but is not collision-proof.
 */
import { GroupData, Preferences, GroupVote } from '../types';
import { User } from './User';

export class Group {
  private id: string;
  private name: string;
  private description: string;
  private memberIds: string[];
  private preferences: Preferences;
  private photos: string[];
  private isActive: boolean;
  private createdAt: Date;
  private updatedAt: Date;
  private pendingVotes: Map<string, GroupVote[]> = new Map(); // proposedUserId -> votes

  constructor(
    id: string,
    name: string,
    description: string,
    memberIds: string[],
    preferences: Preferences,
    photos: string[] = []
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.memberIds = memberIds;
    this.preferences = preferences;
    this.photos = photos;
    this.isActive = true;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  //Getters
  getId(): string { return this.id; }
  getName(): string { return this.name; }
  getDescription(): string { return this.description; }
  getMemberIds(): string[] { return this.memberIds; }
  getPreferences(): Preferences { return this.preferences; }
  getPhotos(): string[] { return this.photos; }
  getIsActive(): boolean { return this.isActive; }
  getCreatedAt(): Date { return this.createdAt; }
  getUpdatedAt(): Date { return this.updatedAt; }

  //Setters
  setName(name: string): void {
    this.name = name;
    this.updatedAt = new Date();
  }

  setDescription(description: string): void {
    this.description = description;
    this.updatedAt = new Date();
  }

  setPreferences(preferences: Preferences): void {
    this.preferences = preferences;
    this.updatedAt = new Date();
  }

  setPhotos(photos: string[]): void {
    this.photos = photos;
    this.updatedAt = new Date();
  }

  //Methods
  addMember(userId: string): void {
    if (!this.memberIds.includes(userId)) {
      this.memberIds.push(userId);
      this.updatedAt = new Date();
    }
  }

  removeMember(userId: string): void {
    this.memberIds = this.memberIds.filter(id => id !== userId);
    this.updatedAt = new Date();
  }

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

  /**
   * Test a candidate against the group's merged preferences.
   *
   * Mirrors `User.isCompatibleWith`, with one asymmetry: the candidate's budget
   * ceiling must be at least the group's, since a member who cannot cover the
   * group's target rent is not a viable addition. The remaining criteria - age,
   * gender, cleanliness and noise within two points, exact agreement on pets and
   * smoking - are the same.
   *
   * @param user - the candidate being evaluated.
   * @returns true when the candidate fits the group profile.
   */
  isCompatibleWithUser(user: User): boolean {
    const userPrefs = user.getPreferences();
    const groupPrefs = this.preferences;

    // Check age compatibility
    if (user.getAge() < groupPrefs.minAge || user.getAge() > groupPrefs.maxAge) {
      return false;
    }

    // Check gender preference
    if (!groupPrefs.preferredGender.includes(user.getGender() as 'male' | 'female' | 'non-binary' | 'other')) {
      return false;
    }

    // Check rent compatibility
    if (userPrefs.maxRent < groupPrefs.maxRent) {
      return false;
    }

    // Check cleanliness compatibility (within 2 levels)
    if (Math.abs(userPrefs.cleanlinessLevel - groupPrefs.cleanlinessLevel) > 2) {
      return false;
    }

    // Check noise tolerance compatibility (within 2 levels)
    if (Math.abs(userPrefs.noiseTolerance - groupPrefs.noiseTolerance) > 2) {
      return false;
    }

    // Check pet compatibility
    if (userPrefs.petFriendly !== groupPrefs.petFriendly) {
      return false;
    }

    // Check smoking compatibility
    if (userPrefs.smokingAllowed !== groupPrefs.smokingAllowed) {
      return false;
    }

    return true;
  }

  /**
   * Open a vote on admitting a new member.
   *
   * The proposer's own 'yes' is recorded as the first ballot, so proposing
   * counts as voting in favour. Re-proposing the same candidate is a no-op
   * rather than a duplicate ballot.
   *
   * @param proposedUserId - the candidate.
   * @param proposerId     - the member opening the vote.
   * @throws if the proposer is not a member, or the candidate already is one.
   */
  proposeMember(proposedUserId: string, proposerId: string): void {
    if (!this.memberIds.includes(proposerId)) {
      throw new Error('Only group members can propose new members');
    }

    if (this.memberIds.includes(proposedUserId)) {
      throw new Error('User is already a member of this group');
    }

    //Initialize votes array for this proposed user if it doesn't exist
    if (!this.pendingVotes.has(proposedUserId)) {
      this.pendingVotes.set(proposedUserId, []);
    }

    //Add the user who proposed the member a default 'yes' vote
    const votes = this.pendingVotes.get(proposedUserId)!;
    const existingVote = votes.find(vote => vote.voterId === proposerId);
    
    if (!existingVote) {
      votes.push({
        id: `vote_${Date.now()}_${proposerId}`,
        groupId: this.id,
        proposedUserId,
        voterId: proposerId,
        vote: 'yes',
        createdAt: new Date()
      });
    }
  }

  /**
   * Cast or change a ballot on an open proposal. A member who has already voted
   * has their previous ballot replaced rather than duplicated.
   *
   * @param proposedUserId - the candidate being voted on.
   * @param voterId        - the member voting.
   * @param vote           - 'yes' or 'no'.
   * @throws if the voter is not a member, or no proposal is open.
   */
  voteOnMember(proposedUserId: string, voterId: string, vote: 'yes' | 'no'): void {
    if (!this.memberIds.includes(voterId)) {
      throw new Error('Only group members can vote');
    }

    if (!this.pendingVotes.has(proposedUserId)) {
      throw new Error('No pending proposal for this user');
    }

    const votes = this.pendingVotes.get(proposedUserId)!;
    const existingVoteIndex = votes.findIndex(vote => vote.voterId === voterId);
    
    if (existingVoteIndex >= 0) {
      votes[existingVoteIndex].vote = vote;
    } else {
      votes.push({
        id: `vote_${Date.now()}_${voterId}`,
        groupId: this.id,
        proposedUserId,
        voterId,
        vote,
        createdAt: new Date()
      });
    }

    this.updatedAt = new Date();
  }

  /**
   * Whether a proposal has carried.
   *
   * The threshold is `ceil(memberCount / 2)` 'yes' ballots, matching the /vote
   * endpoint in server/index.js.
   *
   * KNOWN ISSUES, shared with the server implementation:
   *   - The `totalVotes >= requiredVotes` clause below is mathematically
   *     redundant. Since `totalVotes = yesVotes + noVotes >= yesVotes`, it is
   *     implied by the first clause and can never change the outcome. It appears
   *     to have been intended as a quorum check, but does not act as one.
   *   - In a two-member group the threshold is 1, which the proposer's own
   *     automatic 'yes' already satisfies. The remaining member voting 'no'
   *     therefore still admits the candidate - a rejection is counted as an
   *     approval.
   *   - For even member counts the threshold is exactly half, not a majority:
   *     2 of 4, 3 of 6, and 4 of 8 all pass.
   *
   * Left unchanged because this pass is documentation-only; see the README's
   * Known Limitations.
   *
   * @param proposedUserId - the candidate.
   * @returns true when the candidate has been admitted by vote.
   */
  isMemberAccepted(proposedUserId: string): boolean {
    if (!this.pendingVotes.has(proposedUserId)) {
      return false;
    }

    const votes = this.pendingVotes.get(proposedUserId)!;
    const yesVotes = votes.filter(vote => vote.vote === 'yes').length;
    const noVotes = votes.filter(vote => vote.vote === 'no').length;
    
    //Need majority of group members to vote yes
    const totalVotes = yesVotes + noVotes;
    const requiredVotes = Math.ceil(this.memberIds.length / 2);
    
    return yesVotes >= requiredVotes && totalVotes >= requiredVotes;
  }

  /**
   * Running tally for a proposal, for display in the group UI. Returns a
   * zeroed-out result (with the threshold still populated) when no proposal is
   * open for the given candidate, so callers need not special-case that.
   */
  getVotingStatus(proposedUserId: string): {
    yesVotes: number;
    noVotes: number;
    totalVotes: number;
    requiredVotes: number;
    isAccepted: boolean;
  } {
    if (!this.pendingVotes.has(proposedUserId)) {
      return {
        yesVotes: 0,
        noVotes: 0,
        totalVotes: 0,
        requiredVotes: Math.ceil(this.memberIds.length / 2),
        isAccepted: false
      };
    }

    const votes = this.pendingVotes.get(proposedUserId)!;
    const yesVotes = votes.filter(vote => vote.vote === 'yes').length;
    const noVotes = votes.filter(vote => vote.vote === 'no').length;
    const totalVotes = yesVotes + noVotes;
    const requiredVotes = Math.ceil(this.memberIds.length / 2);
    const isAccepted = yesVotes >= requiredVotes && totalVotes >= requiredVotes;

    return {
      yesVotes,
      noVotes,
      totalVotes,
      requiredVotes,
      isAccepted
    };
  }

  //Clear pending votes for a user (after acceptance or rejection)
  clearPendingVotes(proposedUserId: string): void {
    this.pendingVotes.delete(proposedUserId);
    this.updatedAt = new Date();
  }

  /**
   * Flatten to the plain `GroupData` shape used for API payloads.
   * Note that `pendingVotes` is deliberately omitted - voting state is
   * transient and is owned by the server.
   */
  toJSON(): GroupData {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      memberIds: this.memberIds,
      preferences: this.preferences,
      photos: this.photos,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
