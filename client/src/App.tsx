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
    
    // Load potential matches from API
    await loadPotentialMatches(user);
    
    // Load matches from API
    await loadMatches(user);
  };

  const loadPotentialMatches = async (user: User) => {
    try {
      console.log('Loading potential matches for user:', user.getId());
      const response = await fetch(`/api/users/${user.getId()}/potential-matches`, {
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
        console.error('Failed to load matches');
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
      // Send swipe to API
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
      
      // For pending matches, we need to swipe left to decline
      if (matchId.startsWith('pending_')) {
        const pendingMatch = matches.find(m => m.id === matchId);
        if (pendingMatch) {
          // Swipe left on the user who liked us
          const targetUserId = pendingMatch.userId1 === currentUser.getId() ? pendingMatch.userId2 : pendingMatch.userId1;
          await handleSwipe(targetUserId, 'pass');
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

  const handleViewChange = async (view: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile') => {
    setCurrentView(view);
    
    // Refresh potential matches when switching to discover/swipe tab
    if (view === 'swipe' && currentUser) {
      await loadPotentialMatches(currentUser);
    }
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
          <div className="swipe-container">
            <div className="card-stack">
              {potentialMatches.length > 0 ? (
                potentialMatches.map((user, index) => (
                  <SwipeCard
                    key={user.getId()}
                    user={user}
                    onSwipe={handleSwipe}
                    style={{
                      zIndex: potentialMatches.length - index,
                      transform: `translateY(${index * 4}px) scale(${1 - index * 0.05})`
                    }}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <h2>No more potential matches</h2>
                  <p>Check back later for new profiles!</p>
                </div>
              )}
            </div>
          </div>
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
            // profileManager={profileManager} // COMMENTED OUT - Using API instead
            // matchingSystem={matchingSystem} // COMMENTED OUT - Using API instead
          />
        )}

        {currentView === 'messages' && (
          <MessagingInterface
            currentUser={currentUser}
          />
        )}

        {currentView === 'profile' && (
          <Profile
            currentUser={currentUser}
            onProfileUpdate={handleProfileUpdate}
          />
        )}
      </div>
    </div>
  );
};

export default App;
