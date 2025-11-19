/**
 * MAIN APP COMPONENT - Root React component for Homey roommate finder client
 * Manages application state, authentication flow, and view navigation between swipe/matches/groups/messages.
 * Handles user initialization from API data, potential match loading, and swipe actions.
 * Coordinates with authService for JWT authentication and provides unified interface for all app features.
 * Converts API user data to User class instances and manages real-time match updates.
 */
import React, { useState, useEffect } from 'react';
import { authService } from './services/authService';
import { AuthPage } from './components/Auth/AuthPage';
// COMMENTED OUT - Using MongoDB/API instead of local memory storage
// import { ProfileManager } from './classes/ProfileManager';
// import { MatchingSystem } from './classes/MatchingSystem';
import { UserData, GroupData, Preferences } from './types';
import { User } from './classes/User';
import { Group } from './classes/Group';
import SwipeCard from './components/SwipeCard';
import Header from './components/Header';
import MatchesList from './components/MatchesList';
import GroupManagement from './components/GroupManagement';
import MessagingInterface from './components/MessagingInterface';
import { Profile } from './components/Profile';
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
  const [currentView, setCurrentView] = useState<'swipe' | 'matches' | 'groups' | 'messages' | 'profile'>('swipe');
  const [isLoading, setIsLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterOptions>({});

  // Check authentication status on app load
  useEffect(() => {
    checkAuthStatus();
  }, []);

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
      authService.logout();
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

  const loadPotentialMatches = async (user: User, filters?: FilterOptions) => {
    try {
      console.log('Loading potential matches for user:', user.getId(), 'with filters:', filters);
      
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
        setPotentialMatches(potential);
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
        setMatches([]);
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

  const handleSwipe = async (userId: string, action: 'like' | 'pass') => {
    if (!currentUser) return;

    try {
      // If this is a group card (group_ prefix), send a group join request instead of a swipe
      if (String(userId).startsWith('group_')) {
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

      // Send swipe to API for individual users
      const response = await fetch('/api/swipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({
          targetUserId: userId,
          action: action === 'like' ? 'like' : 'dislike'
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Remove swiped user from potential matches
        setPotentialMatches(prev => prev.filter(user => user.getId() !== userId));
        
        // If there was a match, reload matches
        if (result.match) {
          await loadMatches(currentUser);
        }
      } else {
        console.error('Failed to record swipe');
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

  const handleAcceptMatch = async (matchId: string | undefined) => {
    if (!currentUser) return;
    
    if (!matchId) {
      console.error('Cannot accept match: matchId is undefined');
      return;
    }

    try {
      console.log('Accepting match:', matchId);
      
      // Find the match object to understand what type it is
      const match = matches.find(m => m.id === matchId || (m as any)._id === matchId);
      console.log('Found match object:', match);
      
      if (!match) {
        console.error('Match not found in matches array');
        return;
      }
      
      // For pending matches (one-way likes), we need to swipe back to create the actual match
      if (matchId.startsWith('pending_')) {
        // This is a pending match created by the frontend
        const targetUserId = (match as any).userId1 === currentUser.getId() ? (match as any).userId2 : (match as any).userId1;
        console.log('Swiping right on pending match target:', targetUserId);
        await handleSwipe(targetUserId, 'like');
      } else {
        // This is a real match from the database - call the accept endpoint
        console.log('Accepting real match via API:', matchId);
        
        const response = await fetch(`/api/matches/${matchId}/accept`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('Match accepted successfully:', result);
        } else {
          console.error('Failed to accept match:', response.status);
        }
      }
      
      // Reload matches to get the updated state
      await loadMatches(currentUser);
      
      // Switch to messages view
      setCurrentView('messages');
    } catch (error) {
      console.error('Error accepting match:', error);
    }
  };

  const handleDeclineMatch = async (matchId: string | undefined) => {
    if (!currentUser) return;
    
    if (!matchId) {
      console.error('Cannot decline match: matchId is undefined');
      return;
    }

    try {
      console.log('Declining match:', matchId);
      
      // Handle pending matches (those that start with 'pending_')
      if (matchId.startsWith('pending_')) {
        const pendingMatch = matches.find(m => m.id === matchId);
        if (pendingMatch) {
          // Swipe left on the user who liked us
          const targetUserId = pendingMatch.userId1 === currentUser.getId() ? pendingMatch.userId2 : pendingMatch.userId1;
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

  const handleProfileUpdate = (updatedUser: User) => {
    setCurrentUser(updatedUser);
    // You might also want to update the backend here
    // await authService.updateProfile(updatedUser.toJSON());
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCurrentUserData(null);
    setPotentialMatches([]);
    setMatches([]);
    setCurrentView('swipe');
  };

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

  const handleViewChange = async (view: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile') => {
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
              {/* Filter Button - Top Left Below Navigation */}
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

              {/* Swipe Cards - Positioned Higher */}
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
            // profileManager={profileManager} // COMMENTED OUT - Using API instead
          />
        )}
        
        {currentView === 'groups' && (
          <GroupManagement
            currentUser={currentUser}
            key={`groups-${currentUserData?.id}-${Date.now()}`} // Force complete re-render
            // profileManager={profileManager} // COMMENTED OUT - Using API instead
            // matchingSystem={matchingSystem} // COMMENTED OUT - Using API instead
          />
        )}

        {currentView === 'messages' && (
          <MessagingInterface
            currentUser={currentUser}
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
