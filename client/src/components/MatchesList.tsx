/**
 * MATCHES LIST COMPONENT - Displays and manages user matches and group creation
 * Shows pending matches from users who liked you with accept/decline options.
 * Provides modal for viewing detailed match profiles with photos and preferences.
 * Handles match acceptance/rejection and coordinates with API for match updates.
 * Previously included group creation functionality (now handled via API endpoints).
 */
import React, { useState } from 'react';
import { User } from '../classes/User';
// import { ProfileManager } from '../classes/ProfileManager'; // COMMENTED OUT - Using API instead

interface Match {
  id: string;
  userId1: string;
  userId2: string;
  status: 'pending' | 'accepted' | 'rejected' | 'group_created';
  createdAt: Date;
  updatedAt: Date;
}

interface MatchesListProps {
  matches: Match[];
  currentUser: User;
  onCreateGroup: (matchId: string, groupName: string, groupDescription: string) => void;
  onAcceptMatch: (matchId: string) => void;
  onDeclineMatch?: (matchId: string) => void;
  // profileManager: ProfileManager; // COMMENTED OUT - Using API instead
}

const MatchesList: React.FC<MatchesListProps> = ({ matches, currentUser, onCreateGroup, onAcceptMatch, onDeclineMatch }) => {
  const [showCreateGroup, setShowCreateGroup] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [showProfile, setShowProfile] = useState<any | null>(null);

  const getOtherUserInfo = (match: any): { name: string; user: any } => {
    // For pending matches, use the likedBy field
    if (match.likedBy && match.likedBy.name) {
      return { name: match.likedBy.name, user: match.likedBy };
    }
    
    // For regular matches from API, the user data is included in userId1/userId2
    if (match.userId1 && typeof match.userId1 === 'object' && match.userId1.name) {
      // Check if this is the other user (not current user)
      if (match.userId1._id !== currentUser.getId()) {
        return { name: match.userId1.name, user: match.userId1 };
      }
    }
    if (match.userId2 && typeof match.userId2 === 'object' && match.userId2.name) {
      // Check if this is the other user (not current user)
      if (match.userId2._id !== currentUser.getId()) {
        return { name: match.userId2.name, user: match.userId2 };
      }
    }
    
    // Fallback for older matches - no profileManager available with API approach
    const otherUserId = match.userId1 === currentUser.getId() ? match.userId2 : match.userId1;
    return { 
      name: 'Unknown User',
      user: null
    };
  };

  const handleCreateGroup = (matchId: string) => {
    if (groupName.trim() && groupDescription.trim()) {
      onCreateGroup(matchId, groupName.trim(), groupDescription.trim());
      setShowCreateGroup(null);
      setGroupName('');
      setGroupDescription('');
    }
  };

  const pendingMatches = matches.filter(match => match.status === 'pending');
  // Don't show accepted matches - they should only appear in messages
  const groupCreatedMatches = matches.filter(match => match.status === 'group_created');

  return (
    <div style={{ color: 'white' }}>
      <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Your Matches</h2>
      
      {pendingMatches.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          {/* <h3 style={{ marginBottom: '15px', color: '#fdcb6e' }}>Pending Matches</h3> */}
          {pendingMatches.map(match => {
            console.log('Rendering match:', match);
            const { name, user } = getOtherUserInfo(match);
            return (
              <div key={match.id || Math.random()} className="card" style={{ marginBottom: '15px', padding: '20px' }}>
                <p style={{ marginBottom: '10px', color: 'black', fontWeight: '600' }}>
                  <span 
                    onClick={() => {
                      console.log('User data for profile:', user);
                      setShowProfile(user);
                    }}
                    style={{ 
                      color: '#6c5ce7', 
                      cursor: 'pointer', 
                      textDecoration: 'underline',
                      fontWeight: 'bold'
                    }}
                  >
                    {name}
                  </span> wants to match with you!
                </p>
                <p style={{ fontSize: '14px', color: '#636e72', marginBottom: '15px' }}>
                  Liked you on {new Date(match.createdAt).toLocaleDateString()}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-success"
                    onClick={() => {
                      console.log('Accepting match - full object:', match);
                      console.log('Match ID:', match.id);
                      if (match.id) {
                        onAcceptMatch(match.id);
                      } else {
                        console.error('Match ID is undefined!');
                      }
                    }}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    Accept Match
                  </button>
                  {onDeclineMatch && (
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        console.log('Declining match - full object:', match);
                        console.log('Match ID:', match.id);
                        if (match.id) {
                          onDeclineMatch(match.id);
                        } else {
                          console.error('Match ID is undefined!');
                        }
                      }}
                      style={{ 
                        fontSize: '14px', 
                        padding: '8px 16px',
                        backgroundColor: '#e17055',
                        borderColor: '#e17055'
                      }}
                    >
                      Decline
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      {groupCreatedMatches.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '15px', color: '#74b9ff' }}>Groups Created</h3>
          {groupCreatedMatches.map(match => {
            const { name } = getOtherUserInfo(match);
            return (
              <div key={match.id} className="card" style={{ marginBottom: '15px', padding: '20px' }}>
                <p style={{ marginBottom: '10px', color: 'white', fontWeight: '600' }}>
                  Group with {name} created successfully! 
                </p>
                <p style={{ fontSize: '14px', color: '#636e72' }}>
                  Created on {new Date(match.updatedAt).toLocaleDateString()}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {pendingMatches.length === 0 && groupCreatedMatches.length === 0 && (
        <div className="empty-state">
          <h2>No matches yet</h2>
          <p>Keep swiping to find your perfect roommate!</p>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ padding: '30px', maxWidth: '400px', width: '90%' }}>
            <h3 style={{ marginBottom: '20px', textAlign: 'center' }}>Create Group</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Group Name
              </label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Description
              </label>
              <textarea
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="Describe your ideal living situation"
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '16px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreateGroup(null);
                  setGroupName('');
                  setGroupDescription('');
                }}
                style={{ fontSize: '14px', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={() => handleCreateGroup(showCreateGroup)}
                disabled={!groupName.trim() || !groupDescription.trim()}
                style={{ fontSize: '14px', padding: '8px 16px' }}
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Popup Modal */}
      {showProfile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ padding: '30px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>{showProfile?.name || 'User'}'s Profile</h3>
              <button 
                onClick={() => setShowProfile(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '0'
                }}
              >
                ×
              </button>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <img
                src={showProfile?.photos?.[0] || '/default_user.png'}
                alt={showProfile?.name || 'User'}
                style={{
                  width: '150px',
                  height: '150px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  margin: '0 auto',
                  display: 'block'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default_user.png';
                }}
              />
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: '0 0 10px 0' }}>{showProfile?.name || 'Unknown User'}</h2>
              <p style={{ color: '#636e72', margin: '0' }}>
                {showProfile?.age || 'N/A'} years old • {showProfile?.gender || 'Not specified'}
              </p>
              {showProfile?.email && (
                <p style={{ color: '#636e72', margin: '5px 0 0 0', fontSize: '14px' }}>
                  {showProfile.email}
                </p>
              )}
            </div>

            {showProfile.bio && (
              <div style={{ marginBottom: '20px' }}>
                <h4>About</h4>
                <p>{showProfile.bio}</p>
              </div>
            )}

            {showProfile.preferences && (
              <div style={{ marginBottom: '20px' }}>
                <h4>Preferences</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                  <div><strong>Age:</strong> {showProfile.preferences.minAge}-{showProfile.preferences.maxAge}</div>
                  <div><strong>Max Rent:</strong> ${showProfile.preferences.maxRent}</div>
                  <div><strong>Cleanliness:</strong> {showProfile.preferences.cleanlinessLevel}/5</div>
                  <div><strong>Noise Tolerance:</strong> {showProfile.preferences.noiseTolerance}/5</div>
                  <div><strong>Pet Friendly:</strong> {showProfile.preferences.petFriendly ? 'Yes' : 'No'}</div>
                  <div><strong>Smoking:</strong> {showProfile.preferences.smokingAllowed ? 'Yes' : 'No'}</div>
                </div>
                {showProfile.preferences.location && (
                  <p style={{ marginTop: '10px' }}>
                    <strong>Location:</strong> {showProfile.preferences.location.city}, {showProfile.preferences.location.state}
                  </p>
                )}
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowProfile(null)}
                style={{ fontSize: '14px', padding: '10px 20px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MatchesList;
