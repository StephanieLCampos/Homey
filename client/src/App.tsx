/**
 * MAIN APP COMPONENT
 *
 * The root of the client and the owner of essentially all application state. It
 * decides whether to show the authentication page or the app, holds the signed-in
 * user, the swipe deck, the matches list and the active filters, and routes
 * between the six views. The child components below are largely presentational;
 * they raise intent through callbacks and this component performs the API calls.
 *
 * Responsibilities, in order through the file:
 *   1. State and group capacity helpers.
 *   2. Effects - session restore on load, group data on status change, data
 *      refresh on view change, and the Socket.io connection.
 *   3. Authentication - `checkAuthStatus`, `handleAuthSuccess`,
 *      `initializeAuthenticatedApp`, which converts the API user into a `User`.
 *   4. Data loading - `loadPotentialMatches`, `loadMatches`.
 *   5. Actions - swipe, accept, decline, remove, profile update, logout, filters.
 *   6. Render - the header, the active view, and the filter panel.
 *
 * Two ideas run through the whole file and explain most of its shape:
 *
 *   - Heterogeneous ids. The matches endpoint returns four kinds of record
 *     distinguished by an id prefix - `pending_` (a one-way like), `group_match_`
 *     (a group invitation), `group_` (a joinable group) and a bare ObjectId (a
 *     real match). Every action handler dispatches on that prefix to choose the
 *     right endpoint, because each kind is accepted or declined differently.
 *
 *   - Individual versus group identity. Whether the user is in a group changes
 *     which swipe endpoint applies, whether the deck loads at all, and which
 *     views are meaningful. `currentUserData.status` is consulted throughout, and
 *     any action that might change it ends by refreshing the user.
 *
 * The socket here is a third instance alongside those in MessagingInterface and
 * GroupManagement; this one listens for the events that invalidate *this*
 * component's state - `matchInvalidated`, `groupUpdated`, `memberLeft`.
 *
 * Connections:
 *   - client/src/services/authService.ts - session and token handling.
 *   - client/src/classes/User.ts - wraps API user records as `User` instances.
 *   - client/src/components/* - every view rendered below.
 *   - server/index.js - the entire API surface consumed here.
 *
 * Notes:
 *   - Some commented-out blocks below are the original in-memory implementation
 *     that predated the backend. The classes they referenced (ProfileManager,
 *     MatchingSystem) have since been removed from the repository.
 *   - Several flows respond to a state change by reloading the page rather than
 *     reconciling state. That is blunt but deliberate: joining or leaving a group
 *     invalidates nearly everything at once.
 *   - Known limitation: `unreadCount` is hard-coded to 0 in the header, so the
 *     unread badge never appears.
 */
import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { authService } from './services/authService';
import { AuthPage } from './components/Auth/AuthPage';
// Note: earlier revisions imported ProfileManager and MatchingSystem here to run
// matching in browser memory. Both were superseded by the server API and have
// since been removed from the repository.
import { UserData, GroupData, Preferences } from './types';
import { User } from './classes/User';
import SwipeCard from './components/SwipeCard';
import Header from './components/Header';
import MatchesList from './components/MatchesList';
import GroupManagement from './components/GroupManagement';
import MessagingInterface from './components/MessagingInterface';
import { Profile } from './components/Profile';
import Search from './components/Search';
import FilterPanel, { FilterOptions } from './components/FilterPanel';
import sampleUser1Image from './images/sample_user1.png';

const App: React.FC = () => {
  // COMMENTED OUT - Using MongoDB/API instead of local memory storage
  // const [profileManager] = useState(() => new ProfileManager());
  // const [matchingSystem] = useState(() => new MatchingSystem());
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserData, setCurrentUserData] = useState<UserData | null>(null);
  const [potentialMatches, setPotentialMatches] = useState<User[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [currentView, setCurrentView] = useState<'swipe' | 'matches' | 'groups' | 'messages' | 'profile' | 'search'>('swipe');
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({ profileType: 'all' });
  const [userGroupData, setUserGroupData] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  /**
   * Whether the user belongs to a group that has reached capacity. A full group
   * suppresses the swipe deck and match actions, since neither can lead anywhere.
   */
  const isUserGroupFull = (): boolean => {
    if (!currentUserData || currentUserData.status !== 'in_group' || !userGroupData) {
      return false;
    }
    return userGroupData.memberIds?.length >= userGroupData.maxMembers;
  };

  /**
   * Load the user's group, or clear it if they are not in one. The result backs
   * the capacity checks and the member counts shown in the group-full notices.
   */
  const loadUserGroupData = async () => {
    if (!currentUser || !currentUserData || currentUserData.status !== 'in_group' || !currentUserData.groupId) {
      setUserGroupData(null);
      return;
    }

    try {
      const response = await fetch(`/api/groups/${currentUserData.groupId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const groupData = await response.json();
        setUserGroupData(groupData);
      } else {
        console.warn('Failed to load user group data');
        setUserGroupData(null);
      }
    } catch (error) {
      console.error('Error loading user group data:', error);
      setUserGroupData(null);
    }
  };

  // Restore a session from the stored token, once on mount.
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Load group data when user data changes
  useEffect(() => {
    if (currentUserData && currentUserData.status === 'in_group') {
      loadUserGroupData();
    } else {
      setUserGroupData(null);
    }
  }, [currentUserData?.status, currentUserData?.groupId]);

  // Reload the deck and matches on every view change. Deliberately eager: group
  // membership, matches and swipes can all be changed by another user between
  // views, and re-fetching is cheaper than reasoning about which view invalidates
  // what.
  useEffect(() => {
    if (currentUser && isAuthenticated) {
      // Reload data when view changes
      loadPotentialMatches(currentUser, activeFilters).catch(err => console.error('loadPotentialMatches error', err));
      loadMatches(currentUser).catch(err => console.error('loadMatches error', err));
      // Reload group data if user is in a group
      if (currentUserData?.status === 'in_group') {
        loadUserGroupData();
      }
    }
  }, [currentView]);

  // Initialize socket for real-time match invalidation
  useEffect(() => {
    if (currentUser && isAuthenticated) {
      initializeSocket();
    }
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser, isAuthenticated]);

  /**
   * Open the app-level socket.
   *
   * This connection exists for events that invalidate state held *here*, as
   * distinct from the sockets in MessagingInterface and GroupManagement:
   *   - `matchInvalidated` - a pending match is no longer valid, typically
   *     because the other user joined a group. The card is removed silently
   *     rather than with an alert; the user took no action and needs no warning.
   *   - `groupUpdated` / `memberLeft` - the user's group changed size, which
   *     alters both its capacity state and who should appear in the deck, so both
   *     are reloaded in sequence.
   */
  const initializeSocket = () => {
    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      socketRef.current = io(window.location.origin.replace('3000', '3333'), {
        auth: {
          token: authService.getToken()
        }
      });

      socketRef.current.on('connect', () => {
        console.log('App socket connected');
        if (currentUser) {
          socketRef.current?.emit('join', currentUser.getId());
        }
      });

      // Listen for match invalidation events
      socketRef.current.on('matchInvalidated', (data: { matchId: string; reason: string }) => {
        console.log('Match invalidated:', data);
        
        // Remove the invalidated match from the matches list
        setMatches(prevMatches => {
          const filtered = prevMatches.filter(match => {
            const matchId = match.id || match._id;
            return matchId !== data.matchId;
          });
          console.log(`Removed invalidated match ${data.matchId}. Remaining matches:`, filtered.length);
          return filtered;
        });

        // Show notification to user
        if (data.reason === 'User joined a group') {
          // Don't show intrusive alert, just log it
          console.log('A pending match was removed because the user joined a group');
        }
      });

      socketRef.current.on('disconnect', () => {
        console.log('App socket disconnected');
      });

      socketRef.current.on('error', (error) => {
        console.error('App socket error:', error);
      });

      // Listen for group updates (member joins/leaves)
      socketRef.current.on('groupUpdated', (data: { groupId: string; action: string }) => {
        console.log('Group updated:', data);
        // Reload group data if this affects the current user's group
        if (currentUserData?.groupId === data.groupId) {
          loadUserGroupData().then(() => {
            // Reload potential matches after group data is updated
            if (currentUser) {
              loadPotentialMatches(currentUser, activeFilters);
            }
          });
        }
      });

      // Listen for group member changes
      socketRef.current.on('memberLeft', (data: { groupId: string; leftUserId: string }) => {
        console.log('Member left group:', data);
        // Reload group data if this is the current user's group
        if (currentUserData?.groupId === data.groupId) {
          loadUserGroupData().then(() => {
            // Reload potential matches after group data is updated
            if (currentUser) {
              loadPotentialMatches(currentUser, activeFilters);
            }
          });
        }
      });
    } catch (error) {
      console.error('Failed to initialize socket:', error);
    }
  };

  /**
   * Restore a session on start-up.
   *
   * A stored token is validated by fetching the user; any failure - expired
   * token, deleted account - clears the token and every piece of derived state,
   * so the app falls back cleanly to the signed-out view rather than half-loaded.
   */
  const checkAuthStatus = async () => {
    try {
      if (authService.isAuthenticated()) {
        const userData = await authService.getCurrentUser();
        setCurrentUserData(userData);
        setIsAuthenticated(true);
        await initializeAuthenticatedApp(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Force logout and clear all auth state
      authService.logout();
      setIsAuthenticated(false);
      setCurrentUser(null);
      setCurrentUserData(null);
      setPotentialMatches([]);
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async () => {
    try {
      const userData = await authService.getCurrentUser();
      setCurrentUserData(userData);
      setIsAuthenticated(true);
      await initializeAuthenticatedApp(userData);
    } catch (error) {
      console.error('Failed to initialize after auth:', error);
    }
  };

  /**
   * Build the authenticated application state from an API user record.
   *
   * Converts the plain record into a `User` instance and loads the deck and the
   * matches. The default preferences below only apply to a record that predates
   * the preferences field; a normally-registered user always supplies their own.
   *
   * Note the commented-out block: an earlier version skipped loading individual
   * data for users in groups. It was changed deliberately - group members still
   * need to see the deck, because they swipe on behalf of the group.
   *
   * @param userData - the record returned by /api/auth/me.
   */
  const initializeAuthenticatedApp = async (userData: UserData) => {
    // Convert API user data to User class instance
    const defaultPreferences = {
      minAge: 18,
      maxAge: 50,
      preferredGender: ['male', 'female', 'non-binary'],
      maxRent: 2000,
      cleanlinessLevel: 3,
      noiseTolerance: 3,
      petFriendly: true,
      smokingAllowed: false,
      location: { city: 'Unknown', state: 'Unknown' }
    };
    
    const user = new User(
      userData.id,
      userData.email,
      userData.name,
      userData.age,
      userData.gender,
      userData.bio || '',
      userData.photos || [],
      userData.preferences || defaultPreferences
    );
    
    setCurrentUser(user);
    
    /*
    // Only load individual user data if the user is not in a group
    if (userData.status !== 'in_group' && !userData.groupId) {
      // Load potential matches from API
      await loadPotentialMatches(user, activeFilters);
      
      // Load matches from API
      await loadMatches(user);
    } else {
      // User is in a group, clear individual data
      setPotentialMatches([]);
      setMatches([]);
    }
      */
     // Always load potential matches and matches so group members can still see others
     await loadPotentialMatches(user, activeFilters).catch(err => console.error('loadPotentialMatches error', err));
     await loadMatches(user).catch(err => console.error('loadMatches error', err));
  };

  /**
   * Coerce any of the id shapes the API produces into a plain string.
   *
   * Ids reach the client variously as a string, a populated document with `_id`,
   * a serialised ObjectId, or the extended-JSON form `{ $oid }`, depending on
   * which endpoint composed the response and whether `lean()` was used. Every
   * id comparison in this file goes through here, so those differences cannot
   * cause a false mismatch. The guard against '[object Object]' catches a
   * `toString` that has not been overridden.
   *
   * @param val - an identifier in any of the above shapes.
   * @returns the id as a string, or undefined if it cannot be derived.
   */
  const normalizeId = (val: any): string | undefined => {
    if (!val && val !== 0) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'object') {
      // mongoose ObjectId has toString()
      if (typeof val.toString === 'function' && !Array.isArray(val)) {
        const s = val.toString();
        // toString on objects may return '[object Object]'; guard that
        if (s && !s.startsWith('[object')) return s;
      }
      // Some serializers use { $oid: '...' }
      if (val.$oid && typeof val.$oid === 'string') return val.$oid;
      if (val._id && typeof val._id === 'string') return val._id;
      if (val._id && typeof val._id === 'object' && typeof val._id.toString === 'function') {
        const s = val._id.toString();
        if (s && !s.startsWith('[object')) return s;
      }
    }
    try { return String(val); } catch (e) { return undefined; }
  };

  /**
   * Load and normalise the swipe deck.
   *
   * Skipped entirely when the user's group is full - such a group cannot take
   * new members, so there is nothing to swipe on.
   *
   * Active filters become query parameters (arrays joined with commas), and the
   * response is mapped into `User` instances. Group entries need special
   * handling: they are not people, so a `User` is constructed as a carrier and
   * the group-specific fields (`isGroup`, `groupId`, `memberCount`,
   * `maxMembers`) are attached to it. SwipeCard reads those fields back to render
   * a group card. This keeps the deck a single typed array at the cost of the
   * casts below.
   *
   * `profileType` is the one filter applied here rather than by the server,
   * because only the client can tell a group entry from an individual one after
   * this normalisation.
   *
   * @param user    - whose deck to load.
   * @param filters - optional discovery filters.
   */
  const loadPotentialMatches = async (user: User, filters?: FilterOptions) => {
    try {
      console.log('Loading potential matches for user:', user.getId(), 'with filters:', filters);
      
      // Don't load potential matches if user's group is full
      if (isUserGroupFull()) {
        console.log('Group is full, skipping potential matches loading');
        setPotentialMatches([]);
        return;
      }
      
      // Build query parameters for filters
      const queryParams = new URLSearchParams();
      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              if (value.length > 0) {
                queryParams.append(key, value.join(','));
              }
            } else {
              queryParams.append(key, value.toString());
            }
          }
        });
      }
      
      const queryString = queryParams.toString();
      const url = `/api/users/${user.getId()}/potential-matches${queryString ? `?${queryString}` : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      console.log('Potential matches response status:', response.status);
      
      if (response.ok) {
        const potentialMatchesData = await response.json();
        console.log('Potential matches data:', potentialMatchesData);
        
        // Convert API data to User instances
        const potential = potentialMatchesData.map((userData: any) => {
          // Provide default preferences if missing
          const defaultPreferences = {
            minAge: 18,
            maxAge: 50,
            preferredGender: ['male', 'female', 'non-binary'],
            maxRent: 2000,
            cleanlinessLevel: 3,
            noiseTolerance: 3,
            petFriendly: true,
            smokingAllowed: false,
            location: { city: 'Unknown', state: 'Unknown' }
          };
          
            // If the server returned a group entry, represent it with a special User-like object
            if (userData.isGroup || (userData.id && String(userData.id).startsWith('group_'))) {
              const gId = userData.groupId || (userData.id && userData.id.replace('group_', ''));
              // Create a lightweight User object with group marker
              const groupUser = new User(
                `group_${gId}`,
                '',
                userData.name || 'Group',
                userData.age || 0,
                'other',
                userData.bio || '',
                userData.photos || [],
                userData.preferences || defaultPreferences
              );
              // @ts-ignore - attach group metadata
              (groupUser as any).isGroup = true;
              // @ts-ignore
              (groupUser as any).groupId = gId;
              // include member counts so swipe card can display current/target
              (groupUser as any).memberCount = userData.memberCount ?? (userData.members ? userData.members.length : 0);
              (groupUser as any).maxMembers = userData.maxMembers ?? userData.max_size ?? 4;
              return groupUser;
            }

            return new User(
              userData.id || userData._id,
              userData.email,
              userData.name,
              userData.age,
              userData.gender,
              userData.bio || '',
              userData.photos || [],
              userData.preferences || defaultPreferences
            );
        });
        console.log('Converted potential matches:', potential);
        
        // Apply client-side profile type filtering
        let filteredPotential = potential;
        if (filters?.profileType && filters.profileType !== 'all') {
          if (filters.profileType === 'individual') {
            filteredPotential = potential.filter((user: User) => !(user as any).isGroup);
          } else if (filters.profileType === 'groups') {
            filteredPotential = potential.filter((user: User) => (user as any).isGroup);
          }
          console.log(`Filtered potential matches by profile type (${filters.profileType}):`, filteredPotential);
        }
        
        setPotentialMatches(filteredPotential);
      } else {
        const errorData = await response.text();
        console.error('Failed to load potential matches:', response.status, errorData);
        setPotentialMatches([]);
      }
    } catch (error) {
      console.error('Error loading potential matches:', error);
      setPotentialMatches([]);
    }
  };

  /**
   * Load the matches list - real matches, pending likes, group invitations and
   * joinable groups, combined by the server into one array.
   *
   * Each entry is given a stable `id`, falling back from `id` to `_id` and
   * finally to a generated value, because React keys and every action handler
   * key off that field.
   */
  const loadMatches = async (user: User) => {
    try {
      console.log('Loading matches for user:', user.getId());
      const response = await fetch(`/api/users/${user.getId()}/matches`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const matchesData = await response.json();
        console.log('Raw matches data from server:', matchesData);
        console.log('📊 Match types breakdown:');
        matchesData.forEach((match: any, i: number) => {
          console.log(`  ${i+1}. Type: ${match.type || 'user_match'}, Status: ${match.status}, ID: ${match.id || match._id}`);
        });
        
        // Fix the ID field for matches that might have _id instead of id
        const fixedMatches = matchesData.map((match: any) => ({
          ...match,
          id: match.id || match._id || `match_${Date.now()}_${Math.random()}`
        }));
        
        console.log('Fixed matches data:', fixedMatches);
        setMatches(fixedMatches);
      } else {
        const errorText = await response.text();
        console.error('Failed to load matches:', response.status, errorText);
        // Clear any cached matches on error
        setMatches([]);
        
        // If we get a 404, it might mean the user doesn't exist anymore
        if (response.status === 404) {
          console.log('User not found, clearing all data');
          setPotentialMatches([]);
          setMatches([]);
        }
      }
    } catch (error) {
      console.error('Error loading matches:', error);
      setMatches([]);
    }
  };

  /* 
  COMMENTED OUT - Using MongoDB/API instead of local memory storage
  
  const initializeApp = () => {
    // Create sample users
    const sampleUsers = createSampleUsers();
    
    // Set current user (first user)
    setCurrentUser(sampleUsers[0]);
    
    // Get potential matches for current user
    const potential = matchingSystem.getPotentialMatches(sampleUsers[0], sampleUsers.slice(1));
    setPotentialMatches(potential);
    
    // Get incoming likes and create pending matches
    updateMatches(sampleUsers[0]);
    
    setIsLoading(false);
  };
  */

  /* 
  COMMENTED OUT - Using MongoDB/API instead of local memory storage
  
  const updateMatches = (user: User) => {
    // Get existing matches
    const existingMatches = matchingSystem.getMatches(user.getId());
    
    // Get all incoming likes for current user
    const incomingLikes = matchingSystem.getIncomingLikes(user.getId());
    
    // Create pending matches for incoming likes that haven't been matched yet
    const pendingMatches = incomingLikes
      .filter(like => !existingMatches.some(match => 
        match.userId1 === like.userId || match.userId2 === like.userId
      ))
      .map(like => matchingSystem.createMatch(like.userId, user.getId()));
    
    // Update the matches state with all matches
    setMatches(matchingSystem.getMatches(user.getId()));
  };
  */

  /* 
  COMMENTED OUT - Using MongoDB/API instead of local memory storage
  
  const createSampleUsers = (): User[] => {
    const users: User[] = [];
    
    // Sample preferences
    const preferences1: Preferences = {
      minAge: 20,
      maxAge: 30,
      preferredGender: ['female', 'non-binary'],
      maxRent: 2000,
      cleanlinessLevel: 4,
      noiseTolerance: 3,
      petFriendly: true,
      smokingAllowed: false,
      location: { city: 'San Francisco', state: 'CA' }
    };

    const preferences2: Preferences = {
      minAge: 22,
      maxAge: 28,
      preferredGender: ['male', 'non-binary'],
      maxRent: 1800,
      cleanlinessLevel: 3,
      noiseTolerance: 4,
      petFriendly: false,
      smokingAllowed: false,
      location: { city: 'San Francisco', state: 'CA' }
    };

    const preferences3: Preferences = {
      minAge: 21,
      maxAge: 32,
      preferredGender: ['male', 'female'],
      maxRent: 2200,
      cleanlinessLevel: 5,
      noiseTolerance: 2,
      petFriendly: true,
      smokingAllowed: true,
      location: { city: 'San Francisco', state: 'CA' }
    };

    // Create users
    const user1 = profileManager.createUser(
      'user1',
      'alex@example.com',
      'Alex Johnson',
      25,
      'non-binary',
      'Looking for a clean, quiet place to call home. Love cooking and reading!',
      [],
      preferences1
    );

    const user2 = profileManager.createUser(
      'user2',
      'sam@example.com',
      'Sam Chen',
      23,
      'female',
      'Grad student who needs a study-friendly environment. Pet lover!',
      [sampleUser1Image],
      preferences2
    );

    const user3 = profileManager.createUser(
      'user3',
      'mike@example.com',
      'Mike Rodriguez',
      27,
      'male',
      'Professional who values cleanliness and organization. Non-smoker.',
      [],
      preferences3
    );

    users.push(user1, user2, user3);
    
    // Have some users already swipe right on the current user (user1)
    // This will create pending matches visible in the matches tab
    matchingSystem.swipeRight('user2', 'user1'); // Sam likes Alex
    matchingSystem.swipeRight('user3', 'user1'); // Mike likes Alex
    
    return users;
  };
  */

  /**
   * Handle a swipe decision, routing it to whichever endpoint the target and the
   * current user's own state call for. Three cases:
   *
   *   1. Target is a group (`group_` prefix) - a like becomes a request to join
   *      that group; a pass simply drops the card.
   *   2. Current user is in a group - the swipe is cast on the group's behalf via
   *      /api/group/:groupId/swipe, creating a pending group match rather than a
   *      mutual match.
   *   3. Otherwise - an ordinary individual swipe via /api/swipe, which becomes a
   *      match immediately if the target had already liked back.
   *
   * The component's 'pass' is translated to the server's 'dislike' here; the two
   * vocabularies were never unified.
   *
   * The swiped card is removed from the deck on success, and also on the "already
   * swiped" and "no longer available" errors - in both cases the card is stale,
   * and leaving it would trap the user on it.
   *
   * @param userId              - target user or `group_<id>` card.
   * @param action              - 'like' or 'pass'.
   * @param showCongratulations - suppressed when the swipe is a side effect of
   *                              accepting a pending match, where the caller
   *                              reports the outcome itself.
   */
  const handleSwipe = async (userId: string, action: 'like' | 'pass', showCongratulations: boolean = true) => {
    if (!currentUser) return;

    try {
      // Normalize userId shapes (in case caller passed an object)
      const normalizedTarget = normalizeId(userId) || (typeof userId === 'string' ? userId : undefined);
      console.log('handleSwipe: normalized target id:', normalizedTarget, 'original:', userId);
      const targetToUse: any = normalizedTarget || userId;

      // A pre-flight check that the user is still active and not in a group,
      // currently bypassed. It was disabled while debugging a stale-state problem
      // and left off because it costs an extra request per swipe and the server
      // enforces the same rules regardless. The error paths below handle the
      // rejections it would have anticipated.
      // TEMPORARY: Add bypass flag for testing
      const BYPASS_USER_CHECK = true; // Set to false to enable user checks
      
      if (!BYPASS_USER_CHECK) {
        try {
          const currentUserCheck = await fetch(`/api/users/${currentUser.getId()}`, {
            headers: {
              'Authorization': `Bearer ${authService.getToken()}`
            }
          });
          
          if (currentUserCheck.ok) {
            const userData = await currentUserCheck.json();
            if (userData.status === 'in_group') {
              alert('You cannot swipe on other users while in a group. Please leave your group first.');
              return;
            }
            if (userData.profileStatus !== 'active' || !userData.isActive) {
              alert('Your profile is not active. Please check your profile settings.');
              return;
            }
          } else if (currentUserCheck.status === 404) {
            console.error('Current user not found in database:', currentUser.getId());
            console.log('User data is out of sync - forcing re-authentication');
            
            // Clear all cached data
            authService.logout();
            localStorage.clear();
            sessionStorage.clear();
            
            // Force page reload to get fresh data
            alert('Your session has expired. The page will reload to refresh your login.');
            window.location.reload();
            return;
          } else {
            console.warn('Failed to check current user status:', currentUserCheck.status);
            // Continue with swipe anyway - the server will validate
          }
        } catch (error) {
          console.error('Error checking user status:', error);
          // Continue with swipe - server will validate
        }
      } else {
        console.log('User check bypassed for testing - proceeding with swipe');
      }
      
      // A group card is not a swipe target: liking it asks to join the group,
      // which the members then accept or reject. Either way the card leaves the
      // deck, since the decision has been made.
      if (String(targetToUse).startsWith('group_')) {
        if (action === 'like') {
          const groupId = String(userId).replace('group_', '');
          const resp = await fetch(`/api/groups/${groupId}/join-request`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authService.getToken()}`
            },
            body: JSON.stringify({ message: 'Hi, I would like to join your group!' })
          });
          if (resp.ok) {
            alert('Join request sent to the group owners.');
          } else {
            const err = await resp.json().catch(() => ({}));
            alert(err.error || 'Failed to send join request');
          }
        }
        // Remove the group card from the stack
        setPotentialMatches(prev => prev.filter(u => u.getId() !== userId));
        return;
      }

      // Check if user is in a group and use appropriate endpoint
      let response;
      if (currentUserData?.status === 'in_group' && currentUserData?.groupId) {
        // User is in a group, use group swipe endpoint
        response = await fetch(`/api/group/${currentUserData.groupId}/swipe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken()}`
          },
          body: JSON.stringify({
            targetUserId: targetToUse,
            action: action === 'like' ? 'like' : 'dislike'
          })
        });
      } else {
        // Send swipe to API for individual users
        response = await fetch('/api/swipe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken()}`
          },
          body: JSON.stringify({
            targetUserId: targetToUse,
            action: action === 'like' ? 'like' : 'dislike'
          })
        });
      }

      if (response.ok) {
        const result = await response.json();
        
        // DEBUG: Log the server response for group swipes
        if (currentUserData?.status === 'in_group') {
          console.log('🔍 Group swipe result:', result);
        }
        
        // Handle success cases
        if (result.match || result.groupMatch) {
          console.log('🔄 Auto-match detected, reloading matches and switching to messages...');
          await loadMatches(currentUser);
          
          // Switch to messages tab to show the new match
          if (result.match) {
            setCurrentView('messages');
          }
          
          // Show success messages (only for discover tab swipes)
          if (showCongratulations) {
            if (result.match) {
              alert('🎉 Congratulations! This person liked you as well and you guys have automatically matched!');
            } else if (result.groupMatch) {
              alert('🎉 Group invite has been sent to this user!');
            }
          }
        } else if (currentUserData?.status === 'in_group' && action === 'like') {
          // Group liked someone but no immediate match - show success message
          if (showCongratulations) {
            alert('🎉 Group invite has been sent to this user!');
          }
        }
        
        // Remove swiped user from potential matches
        setPotentialMatches(prev => prev.filter(user => user.getId() !== userId));
        console.log('✅ Removed user from potential matches:', userId);
      } else {
        // If the server says we already swiped, refresh matches (this can happen if state was out of sync)
        if (response.status === 400) {
          const bodyText = await response.text().catch(() => '');
          console.warn('Swipe returned 400:', bodyText);
          if (bodyText && bodyText.includes('Already swiped')) {
            console.log('Refreshing matches after Already swiped response');
            await loadMatches(currentUser);
            setPotentialMatches(prev => prev.filter(u => u.getId() !== userId));
            return;
          }
        }
        
        const errorData = await response.json().catch(() => null);
        console.error('Failed to record swipe:', errorData);
        
        // Provide specific error messages
        if (errorData?.error) {
          if (errorData.error.includes('not found') || errorData.error.includes('inactive')) {
            alert('This user is no longer available for matching.');
            // Still remove from potential matches to avoid confusion
            setPotentialMatches(prev => prev.filter(u => u.getId() !== userId));
          } else if (errorData.error.includes('Already swiped')) {
            alert('You have already swiped on this user.');
            setPotentialMatches(prev => prev.filter(u => u.getId() !== userId));
          } else {
            alert(`Error: ${errorData.error}`);
          }
        } else {
          alert('Failed to record swipe. Please try again.');
        }
      }
    } catch (error) {
      console.error('Error recording swipe:', error);
    }
  };

  /* 
  COMMENTED OUT - Using MongoDB/API instead of local memory storage
  This function used profileManager and matchingSystem which are no longer needed.
  Group creation is now handled through API endpoints.
  
  const handleCreateGroup = (matchId: string, groupName: string, groupDescription: string) => {
    if (!currentUser) return;

    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const otherUserId = match.userId1 === currentUser.getId() ? match.userId2 : match.userId1;
    const otherUser = profileManager.getUser(otherUserId);
    if (!otherUser) return;

    // Create group preferences (merge both users' preferences)
    const groupPreferences: Preferences = {
      minAge: Math.max(currentUser.getPreferences().minAge, otherUser.getPreferences().minAge),
      maxAge: Math.min(currentUser.getPreferences().maxAge, otherUser.getPreferences().maxAge),
      preferredGender: currentUser.getPreferences().preferredGender.filter(gender => 
        otherUser.getPreferences().preferredGender.includes(gender)
      ),
      maxRent: Math.min(currentUser.getPreferences().maxRent, otherUser.getPreferences().maxRent),
      cleanlinessLevel: Math.round((currentUser.getPreferences().cleanlinessLevel + otherUser.getPreferences().cleanlinessLevel) / 2) as 1 | 2 | 3 | 4 | 5,
      noiseTolerance: Math.round((currentUser.getPreferences().noiseTolerance + otherUser.getPreferences().noiseTolerance) / 2) as 1 | 2 | 3 | 4 | 5,
      petFriendly: currentUser.getPreferences().petFriendly && otherUser.getPreferences().petFriendly,
      smokingAllowed: currentUser.getPreferences().smokingAllowed && otherUser.getPreferences().smokingAllowed,
      location: currentUser.getPreferences().location
    };

    // Create group
    const groupId = `group_${Date.now()}`;
    const group = profileManager.createGroup(
      groupId,
      groupName,
      groupDescription,
      [currentUser.getId(), otherUserId],
      groupPreferences,
      [...currentUser.getPhotos(), ...otherUser.getPhotos()]
    );

    // Mark match as group created
    matchingSystem.markMatchAsGroupCreated(matchId, groupId);

    // Update current user status
    setCurrentUser(profileManager.getUser(currentUser.getId()));
    
    // Update view to groups
    setCurrentView('groups');
  };
  */

  /**
   * Accept a match, dispatching on the id prefix - the three kinds are accepted
   * in genuinely different ways:
   *
   *   - `pending_<id>`      - a one-way like. There is no match record yet, so
   *                           accepting means swiping right on the liker; the
   *                           server then creates the match from the now-mutual
   *                           likes. Congratulations are suppressed on that inner
   *                           swipe so the user sees one message, not two.
   *   - `group_match_<id>`  - a group invitation. Accepting joins the group, so
   *                           the user record is refreshed and the view moves to
   *                           Groups.
   *   - a bare ObjectId     - a real match; accepted directly, and the view moves
   *                           to Messages where the conversation now lives.
   *
   * @param matchId - the prefixed identifier from the matches list.
   */
  const handleAcceptMatch = async (matchId: string | undefined) => {
    if (!currentUser) return;
    
    if (!matchId) {
      console.error('Cannot accept match: matchId is undefined');
      return;
    }

    try {
      // Ensure we have an auth token
      const token = authService.getToken();
      if (!token) {
        console.error('No auth token found when accepting match');
        alert('You must be logged in to accept matches');
        return;
      }
      console.log('Accepting match:', matchId);

      // Find the match object to understand what type it is
      const match = matches.find(m => {
        const mid = normalizeId((m as any).id || (m as any)._id);
        return mid === matchId;
      });
      console.log('Found match object:', match);
      console.groupCollapsed('Accept debug');
      try {
        console.log('Auth token present?', !!authService.getToken());
        console.log('Matches count:', matches.length);
        console.log('Matches snippet:', matches.slice(0,5));
        console.log('Requested matchId:', matchId);
        console.log('Resolved match object:', match);
      } catch (e) {
        console.error('Error logging accept debug info', e);
      }
      console.groupEnd();
      
      if (!match) {
        console.error('Match not found in matches array');
        return;
      }
      
      // For pending matches (one-way likes), we need to swipe back to create the actual match
      if (matchId && matchId.startsWith('pending_')) {
        // This is a pending match created by the frontend
        // Check if it has likedBy field (pending match from API)
        let targetUserId;
        if ((match as any).likedBy && (match as any).likedBy._id) {
          targetUserId = (match as any).likedBy._id;
        } else if ((match as any).likedBy && typeof (match as any).likedBy === 'string') {
          targetUserId = (match as any).likedBy;
        } else {
          // Fallback to userId1/userId2 with normalization
          const userA = (match as any).userId1;
          const userB = (match as any).userId2;
          const uidA = normalizeId(userA);
          const uidB = normalizeId(userB);
          targetUserId = uidA === currentUser.getId() ? uidB : uidA;
        }
        
        console.log('Swiping right on pending match target:', targetUserId, 'from match:', match);
        if (!targetUserId) {
          console.error('Unable to resolve target user id for pending match:', match);
          alert('Could not accept pending match: target user id is malformed');
          return;
        }
        
        await handleSwipe(targetUserId, 'like', false); // Don't show congratulations for accepting pending matches
        
        // The handleSwipe will create the match, so we need to reload and redirect
        await loadMatches(currentUser);
        setCurrentView('messages');
        alert('Match accepted! You can now message each other.');
        return;
      } else if (matchId && matchId.startsWith('group_match_')) {
        // This is a group match - user accepting invitation to join a group
        console.log('Accepting group match via API:', matchId);
        
        const actualGroupMatchId = matchId.replace('group_match_', '');
        const url = `/api/group-matches/${actualGroupMatchId}/accept`;
        console.log('Sending POST to', url);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const text = await response.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

        if (response.ok) {
          console.log('Group match accepted successfully:', json || 'no-json');
          
          // Show success feedback
          alert('Group match accepted! You have joined the group.');
          
          // Reload user data since they joined a group
          await refreshUserData();
          
          // Switch to groups view
          setCurrentView('groups');
        } else {
          console.error('Failed to accept group match:', response.status, json || text);
          alert((json && json.error) || `Failed to accept group match: ${response.status} - ${text}`);
        }
        return;
      } else {
        // This is a real match from the database - call the accept endpoint
        console.log('Accepting real match via API:', matchId);
        
        const url = `/api/matches/${matchId}/accept`;
        console.log('Sending POST to', url);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        const text = await response.text();
        let json;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

        if (response.ok) {
          console.log('Match accepted successfully:', json || 'no-json');
          
          // Show success feedback
          alert('Match accepted! You can now message each other.');
          
          // Reload matches to get the updated state
          await loadMatches(currentUser);
          
          // Switch to messages view
          setCurrentView('messages');
        } else {
          console.error('Failed to accept match:', response.status, json || text);
          alert((json && json.error) || `Failed to accept match: ${response.status} - ${text}`);
        }
      }
    } catch (error) {
      console.error('Error accepting match:', error);
      alert('An error occurred while accepting the match. Please try again.');
    }
  };

  /**
   * Decline a match, dispatching on the same three id forms:
   *   - `group_match_<id>` - decline the group invitation.
   *   - `pending_<id>`     - pass on the liker, which records the negative swipe
   *                          and stops them reappearing in the deck.
   *   - a bare ObjectId    - mark the match rejected.
   * The matches list is reloaded afterwards so the declined entry disappears.
   */
  const handleDeclineMatch = async (matchId: string | undefined) => {
    if (!currentUser) return;
    
    if (!matchId) {
      console.error('Cannot decline match: matchId is undefined');
      return;
    }

    try {
      console.log('Declining match:', matchId);
      
      // Handle group matches (those that start with 'group_match_')
      if (matchId.startsWith('group_match_')) {
        console.log('Declining group match:', matchId);
        const groupMatchId = matchId.replace('group_match_', '');
        const response = await fetch(`/api/group-matches/${groupMatchId}/decline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to decline group match');
        }
        
        // Remove the group match from the UI
        setMatches(prevMatches => prevMatches.filter(m => m.id !== matchId));
        console.log('Group match declined successfully');
        
      // Handle pending matches (those that start with 'pending_')
      } else if (matchId.startsWith('pending_')) {
        const pendingMatch = matches.find(m => m.id === matchId);
        if (pendingMatch) {
          // Swipe left on the user who liked us
          let targetUserId;
          if ((pendingMatch as any).likedBy && (pendingMatch as any).likedBy._id) {
            targetUserId = (pendingMatch as any).likedBy._id;
          } else if ((pendingMatch as any).likedBy && typeof (pendingMatch as any).likedBy === 'string') {
            targetUserId = (pendingMatch as any).likedBy;
          } else {
            // Fallback to userId1/userId2
            targetUserId = pendingMatch.userId1 === currentUser.getId() ? pendingMatch.userId2 : pendingMatch.userId1;
          }
          await handleSwipe(targetUserId, 'pass');
        }
      } else {
        // Handle real matches using the new API endpoint
        const response = await fetch(`/api/matches/${matchId}/decline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          console.log('Match declined successfully');
        } else {
          const errorData = await response.json();
          console.error('Failed to decline match:', errorData.error);
        }
      }
      
      // Reload matches to remove the declined match
      await loadMatches(currentUser);
    } catch (error) {
      console.error('Error declining match:', error);
    }
  };

  /**
   * Drop a match from the local list without calling the server - used to
   * dismiss a card the user does not want to see, leaving the underlying record
   * intact. It will reappear on the next load.
   */
  const handleRemoveMatch = (matchId: string) => {
    console.log('Removing match from state:', matchId);
    setMatches(prevMatches => prevMatches.filter(match => match.id !== matchId));
  };

  const handleProfileUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    // You might also want to update the backend here
    // await authService.updateProfile(updatedUser.toJSON());
  };

  /**
   * Sign out: clear the token and every piece of user-derived state, and return
   * to the default view so a subsequent sign-in starts clean.
   */
  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentUserData(null);
    setPotentialMatches([]);
    setMatches([]);
    setCurrentView('swipe');
  };

  /** Store new discovery filters and rebuild the deck under them. */
  const handleApplyFilters = async (filters: FilterOptions) => {
    setActiveFilters(filters);
    if (currentUser) {
      await loadPotentialMatches(currentUser, filters);
    }
  };

  const handleShowFilters = () => {
    setShowFilters(true);
  };

  const handleCloseFilters = () => {
    setShowFilters(false);
  };

  const hasActiveFilters = () => {
    return Object.values(activeFilters).some(value => 
      value !== undefined && 
      value !== null && 
      (Array.isArray(value) ? value.length > 0 : true)
    );
  };

  /**
   * Re-read the user from the server and rebuild the application state around
   * them. Called after anything that may have changed group membership, since
   * that status determines which endpoints apply and which views are meaningful.
   */
  const refreshUserData = async () => {
    try {
      console.log('Refreshing user data...');
      const userData = await authService.getCurrentUser();
      console.log('Updated user data:', userData);
      setCurrentUserData(userData);
      await initializeAuthenticatedApp(userData);
      console.log('User data refresh completed');
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  /**
   * Switch views, refreshing what the destination depends on: the Groups view
   * needs current membership, and the swipe deck needs to reflect anyone who has
   * since joined a group or been swiped on elsewhere.
   */
  const handleViewChange = async (view: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile' | 'search') => {
    setCurrentView(view);
    
    // Refresh user data when switching to groups tab to check if user is in a group
    if (view === 'groups') {
      await refreshUserData();
    }
    
    // Refresh potential matches when switching to discover/swipe tab
    if (view === 'swipe' && currentUser) {
      await loadPotentialMatches(currentUser);
    }
  };

  /**
   * Callback for children that change group membership (MessagingInterface,
   * GroupManagement). Refreshing the user is enough - the effects above rebuild
   * everything that depends on their status.
   */
  const handleGroupStatusChange = async () => {
    await refreshUserData();
  };

  if (isLoading) {
    return (
      <div className="container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  if (!currentUser) {
    return (
      <div className="container">
        <div className="empty-state">
          <h2>Loading your profile...</h2>
          <p>Please wait while we set up your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Header 
        currentView={currentView}
        onViewChange={handleViewChange}
        unreadCount={0}
        onLogout={handleLogout}
      />
      
      {/*
        Development aid: clears React state, browser storage and the Cache API,
        then hard-reloads. It exists because several stale-state bugs during
        development could only be cleared by hand. It should be removed before
        this is presented as a finished product.
      */}
      {/* Debug/Refresh Button */}
      <button
        onClick={async () => {
          console.log('🧹 Force clearing ALL cached data...');
          
          // Clear all React state
          setMatches([]);
          setPotentialMatches([]);
          setCurrentUserData(null);
          
          // Clear browser storage
          localStorage.clear();
          sessionStorage.clear();
          
          // Clear any cached requests
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          
          console.log('✅ All cache cleared, reloading...');
          
          // Force complete page reload
          window.location.href = window.location.href;
        }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          padding: '10px 15px',
          background: '#e74c3c',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        🧹 Clear All Cache
      </button>

      {/* Reset All Users Button */}
      <button
        onClick={async () => {
          if (!window.confirm('⚠️ WARNING: This will reset ALL users to a fresh state!\n\nThis will delete:\n- All matches\n- All groups\n- All messages\n- All swipe actions\n- All group requests\n\nUsers and their profiles will be preserved but reset to individual status.\n\nAre you sure you want to continue?')) {
            return;
          }

          console.log('🚨 Resetting all users...');
          
          try {
            const response = await fetch('/api/admin/reset-all', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authService.getToken()}`
              }
            });

            if (response.ok) {
              const result = await response.json();
              console.log('✅ Reset successful:', result);
              alert(`✅ Reset completed successfully!\n\n${result.message}\n\nUsers reset: ${result.resetCounts.usersReset}\nGroups deleted: ${result.resetCounts.groups}\nMatches deleted: ${result.resetCounts.matches}\nMessages deleted: ${result.resetCounts.messages}\n\nThe page will now reload.`);
              
              // Clear all local state
              setMatches([]);
              setPotentialMatches([]);
              setCurrentUserData(null);
              localStorage.clear();
              sessionStorage.clear();
              
              // Reload page to reflect changes
              window.location.reload();
            } else {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
              console.error('Reset failed:', errorData);
              alert(`❌ Reset failed: ${errorData.error}`);
            }
          } catch (error) {
            console.error('Reset error:', error);
            alert('❌ Reset failed: Network error');
          }
        }}
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 1000,
          padding: '10px 15px',
          background: '#ff6b6b',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        🚨 Reset All Users
      </button>
      
      <div className="container">
        {currentView === 'swipe' && (
          <>
            {/* Global style to prevent scrolling */}
            <style>{`
              body {
                overflow: hidden !important;
                height: 100vh !important;
                margin: 0 !important;
              }
              html {
                overflow: hidden !important;
                height: 100% !important;
              }
              .app-layout {
                height: 100vh !important;
                overflow: hidden !important;
              }
              .container {
                height: calc(100vh - 80px) !important;
                overflow: hidden !important;
              }
            `}</style>
            
            <div style={{ 
              position: 'fixed', // Changed from relative to fixed
              top: '80px', // Account for header
              left: 0,
              right: 0,
              bottom: 0,
              overflow: 'hidden'
            }}>
              {/* Filter Button - Top Left Below Navigation (Hidden when group is full) */}
              {!isUserGroupFull() && (
                <div style={{
                  position: 'absolute',
                  top: '120px',
                  left: '40px',
                  zIndex: 10
                }}>
                <button
                  onClick={handleShowFilters}
                  style={{
                    padding: '12px 20px',
                    background: hasActiveFilters() ? '#6c757d' : '#495057',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    backdropFilter: 'blur(10px)'
                  }}
                  onMouseOver={(e) => {
                    (e.target as HTMLButtonElement).style.background = hasActiveFilters() ? '#5a6268' : '#343a40';
                  }}
                  onMouseOut={(e) => {
                    (e.target as HTMLButtonElement).style.background = hasActiveFilters() ? '#6c757d' : '#495057';
                  }}
                >
                  Filters
                  {hasActiveFilters() && (
                    <span style={{
                      background: 'rgba(255, 255, 255, 0.9)',
                      color: '#495057',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginLeft: '4px'
                    }}>
                      {Object.values(activeFilters).filter(v => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)).length}
                    </span>
                  )}
                </button>
                
                {hasActiveFilters() && (
                  <div style={{ 
                    color: '#666', 
                    fontSize: '14px',
                    marginTop: '8px',
                    marginLeft: '4px'
                  }}>
                    {Object.values(activeFilters).filter(v => v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true)).length} filter(s) active
                  </div>
                )}
                </div>
              )}

              {/* Group Full Message or Swipe Cards */}
              {isUserGroupFull() ? (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '400px',
                  textAlign: 'center'
                }}>
                  <div style={{
                    padding: '60px 40px',
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
                    border: '1px solid rgba(0, 0, 0, 0.08)'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
                    <h2 style={{ 
                      color: '#333', 
                      marginBottom: '15px', 
                      fontSize: '24px',
                      fontWeight: '600'
                    }}>
                      Group is Full
                    </h2>
                    <p style={{ 
                      color: '#666', 
                      lineHeight: '1.6',
                      fontSize: '16px',
                      marginBottom: '15px'
                    }}>
                      Sorry, your group is full. You can no longer add others to the group.
                    </p>
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#999',
                      padding: '12px 20px',
                      backgroundColor: '#f8f9fa',
                      borderRadius: '8px',
                      display: 'inline-block'
                    }}>
                      Current members: {userGroupData?.memberIds?.length || 0} / {userGroupData?.maxMembers || 0}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="swipe-container" style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '400px',
                  height: '600px'
                }}>
                  <div className="card-stack" style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%'
                  }}>
                    {potentialMatches.length > 0 ? (
                    potentialMatches.slice(0, 3).reverse().map((user, reverseIndex) => {
                      const index = 2 - reverseIndex;
                      const actualIndex = potentialMatches.slice(0, 3).indexOf(user);
                      const isTopCard = actualIndex === 0;
                      
                      return (
                        <div 
                          key={user.getId()}
                          style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            zIndex: isTopCard ? 10 : 3 - actualIndex,
                            transform: `translateY(${isTopCard ? 0 : actualIndex * 8}px) scale(${1 - actualIndex * 0.03})`,
                            pointerEvents: isTopCard ? 'auto' : 'none',
                            opacity: isTopCard ? 1 : 0.8,
                            filter: isTopCard ? 'none' : 'brightness(0.9)'
                          }}
                        >
                          <SwipeCard
                            user={user}
                            onSwipe={isTopCard ? handleSwipe : () => {}}
                            style={{
                              width: '100%',
                              height: '100%',
                              boxShadow: isTopCard 
                                ? '0 15px 35px rgba(0, 0, 0, 0.25)' 
                                : '0 5px 15px rgba(0, 0, 0, 0.1)',
                              borderRadius: '12px',
                              background: 'white'
                            }}
                          />
                        </div>
                      );
                    })
                  ) : (
                    <div className="empty-state" style={{
                      textAlign: 'center',
                      padding: '40px',
                      backgroundColor: 'white',
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '90%'
                    }}>
                      <h2>No more potential matches</h2>
                      <p>
                        {hasActiveFilters() 
                          ? 'No matches found with current filters. Try adjusting your criteria!' 
                          : 'Check back later for new profiles!'
                        }
                      </p>
                      {hasActiveFilters() && (
                        <button
                          onClick={() => handleApplyFilters({})}
                          style={{
                            marginTop: '15px',
                            padding: '10px 20px',
                            background: 'linear-gradient(45deg, #74b9ff, #0984e3)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '20px',
                            cursor: 'pointer'
                          }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {currentView === 'matches' && (
          <MatchesList
            matches={matches}
            currentUser={currentUser}
            onCreateGroup={() => {}} // COMMENTED OUT - Group creation now handled via API
            onAcceptMatch={handleAcceptMatch}
            onDeclineMatch={handleDeclineMatch}
            onRemoveMatch={handleRemoveMatch}
            isGroupFull={isUserGroupFull()}
            userGroupData={userGroupData}
            // profileManager={profileManager} // COMMENTED OUT - Using API instead
          />
        )}
        
        {currentView === 'groups' && (
          <GroupManagement
            currentUser={currentUser}
            onUserStatusChange={refreshUserData}
            key={`groups-${currentUserData?.id}-${Date.now()}`} // Force complete re-render
            // profileManager={profileManager} // COMMENTED OUT - Using API instead
            // matchingSystem={matchingSystem} // COMMENTED OUT - Using API instead
          />
        )}

        {currentView === 'search' && (
          <Search
            currentUser={currentUser}
          />
        )}

        {currentView === 'messages' && (
          <MessagingInterface
            currentUser={currentUser}
            currentUserData={currentUserData}
            onGroupStatusChange={handleGroupStatusChange}
          />
        )}

        {currentView === 'profile' && (
          <Profile
            currentUser={currentUser}
            onProfileUpdate={handleProfileUpdate}
          />
        )}
      </div>

      {/* Filter Panel Modal */}
      <FilterPanel
        isOpen={showFilters}
        onClose={handleCloseFilters}
        onApplyFilters={handleApplyFilters}
        currentFilters={activeFilters}
      />
    </div>
  );
};

export default App;
