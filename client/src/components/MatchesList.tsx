/**
 * MATCHES LIST COMPONENT - Displays and manages user matches and group creation
 * Shows pending matches from users who liked you with accept/decline options.
 * Provides modal for viewing detailed match profiles with photos and preferences.
 * Handles match acceptance/rejection and coordinates with API for match updates.
 * Previously included group creation functionality (now handled via API endpoints).
 */
import React, { useState } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';
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
  onRemoveMatch?: (matchId: string) => void;
  isGroupFull?: boolean;
  userGroupData?: any;
  // profileManager: ProfileManager; // COMMENTED OUT - Using API instead
}

const MatchesList: React.FC<MatchesListProps> = ({ matches, currentUser, onCreateGroup, onAcceptMatch, onDeclineMatch, onRemoveMatch, isGroupFull, userGroupData }) => {
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

  // Filter out any matches with invalid user data
  const validMatches = matches.filter(match => {
    try {
      // Group matches have different structure, don't filter them out
      if ((match as any).type === 'group_match' || (match as any).type === 'group') {
        console.log('✅ Keeping group match:', match);
        return true;
      }
      
      const otherUserInfo = getOtherUserInfo(match);
      // Skip matches where we can't determine the other user
      if (!otherUserInfo.user && !(match as any).likedBy) {
        console.log('Filtering out invalid match:', match);
        return false;
      }
      return true;
    } catch (error) {
      console.log('Error processing match, filtering out:', match, error);
      return false;
    }
  });

  const pendingMatches = validMatches.filter(match => match.status === 'pending' && !(match as any).type);
  // Group matches (groups that liked the user)
  const groupMatches = validMatches.filter((m: any) => m.type === 'group_match' && m.status === 'pending');
  // Don't show accepted matches - they should only appear in messages
  const groupCreatedMatches = validMatches.filter(match => match.status === 'group_created');
  // Note: Removed serverGroupMatches - we only want actual group invitations, not available groups

  // Show full group message if group is full
  if (isGroupFull) {
    return (
      <div style={{ color: 'white', padding: '20px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Your Matches</h2>
        
        <div style={{
          textAlign: 'center',
          padding: '60px 40px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          color: '#333',
          margin: '0 auto',
          maxWidth: '500px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
          <h3 style={{ 
            color: '#333', 
            marginBottom: '20px', 
            fontSize: '24px',
            fontWeight: '600'
          }}>
            Group Match Requests Paused
          </h3>
          <p style={{ 
            color: '#666', 
            lineHeight: '1.6',
            fontSize: '16px',
            marginBottom: '15px'
          }}>
            You and your group will not accept any match requests as your group is currently full and hidden from others when searching for roommates.
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
    );
  }

  return (
    <div style={{ color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', marginTop: '10px' }}>
        <h2 style={{ margin: 0, textAlign: 'center', flex: 1 }}>Your Matches</h2>
        {pendingMatches.length > 0 && (
          <button
            onClick={() => {
              console.log('Clearing invalid matches...');
              window.location.reload();
            }}
            style={{
              padding: '8px 12px',
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Clear Invalid Matches
          </button>
        )}
      </div>
      
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
                  {(() => {
                    const computedId = match.id || ((match as any)._id ? (typeof (match as any)._id === 'object' ? String((match as any)._id) : (match as any)._id) : undefined);
                    const disabled = !computedId;
                    return (
                      <button
                        className="btn btn-success"
                        onClick={() => {
                          console.log('Accept button clicked for match:', match);
                          console.log('Computed Match ID:', computedId);
                          if (!computedId) {
                            console.error('Computed id is missing, will not call accept API');
                            alert('Unable to accept match: missing match id');
                            return;
                          }
                          onAcceptMatch(computedId as string);
                        }}
                        disabled={disabled}
                        style={{ fontSize: '14px', padding: '8px 16px' }}
                      >
                        {disabled ? 'Unavailable' : 'Accept Match'}
                      </button>
                    );
                  })()}
                  {onDeclineMatch && (
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        console.log('Declining match - full object:', match);
                        const computedId = match.id || ((match as any)._id ? (typeof (match as any)._id === 'object' ? String((match as any)._id) : (match as any)._id) : undefined);
                        console.log('Computed Match ID for decline:', computedId);
                        if (computedId && onDeclineMatch) {
                          onDeclineMatch(computedId);
                        } else {
                          console.error('Match ID is undefined or decline handler missing!');
                          alert('Unable to decline match: missing match id');
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
                  {onRemoveMatch && (
                    <button
                      onClick={() => {
                        console.log('Removing match:', match.id);
                        if (match.id) {
                          onRemoveMatch(match.id);
                        }
                      }}
                      style={{ 
                        fontSize: '12px', 
                        padding: '6px 10px',
                        backgroundColor: '#636e72',
                        borderColor: '#636e72',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {groupMatches.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '15px', color: '#bdc3c7' }}>Group Invitations</h3>
          {groupMatches.map((groupMatch: any) => {
            const group = groupMatch.group;
            return (
              <div key={groupMatch.id} className="card" style={{ marginBottom: '15px', padding: '20px' }}>
                <p style={{ marginBottom: '10px', color: 'black', fontWeight: '600' }}>
                  <span 
                    style={{ 
                      color: '#6c5ce7', 
                      cursor: 'pointer', 
                      textDecoration: 'underline',
                      fontWeight: 'bold'
                    }}
                  >
                    {group.name}
                  </span> wants you to join their group!
                </p>
                <p style={{ fontSize: '14px', color: '#636e72', marginBottom: '10px' }}>
                  {group.description}
                </p>
                
                {/* Display member details with images */}
                <div style={{ marginBottom: '15px' }}>
                  <p style={{ fontSize: '13px', color: '#636e72', marginBottom: '8px', fontWeight: '600' }}>
                    Members ({group.memberCount}/{group.maxMembers}):
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {group.members && group.members.length > 0 ? (
                      group.members.map((member: any, index: number) => {
                        // Calculate responsive sizing based on group size (max 10 members)
                        const memberCount = group.members.length;
                        let imageSize, fontSize, padding, maxWidth;
                        
                        if (memberCount <= 2) {
                          imageSize = '50px'; fontSize = '12px'; padding = '8px'; maxWidth = '200px';
                        } else if (memberCount <= 4) {
                          imageSize = '40px'; fontSize = '11px'; padding = '6px'; maxWidth = '150px';
                        } else if (memberCount <= 6) {
                          imageSize = '32px'; fontSize = '10px'; padding = '5px'; maxWidth = '130px';
                        } else if (memberCount <= 8) {
                          imageSize = '28px'; fontSize = '9px'; padding = '4px'; maxWidth = '110px';
                        } else {
                          imageSize = '24px'; fontSize = '8px'; padding = '3px'; maxWidth = '100px';
                        }
                        
                        return (
                          <div 
                            key={member._id || index}
                            style={{ 
                              background: 'rgba(108, 92, 231, 0.1)', 
                              padding: padding, 
                              borderRadius: '12px',
                              border: '1px solid rgba(108, 92, 231, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              maxWidth: maxWidth
                            }}
                          >
                            {/* User image */}
                            <img
                              src={member.photos?.[0] || '/default_user.png'}
                              alt={member.name || 'User'}
                              style={{
                                width: imageSize,
                                height: imageSize,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                flexShrink: 0
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/default_user.png';
                              }}
                            />
                            {/* User details */}
                            <div style={{ 
                              display: 'flex', 
                              flexDirection: 'column',
                              minWidth: 0, // Allows text to shrink
                              flex: 1
                            }}>
                              <span style={{ 
                                fontSize: fontSize, 
                                color: '#2d3436', 
                                fontWeight: '600',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {member.name || 'Unknown'}
                              </span>
                              <span style={{ 
                                fontSize: memberCount <= 2 ? '10px' : '9px', 
                                color: '#636e72',
                                whiteSpace: 'nowrap'
                              }}>
                                {member.gender || 'N/A'}, {member.age || 'N/A'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <span style={{ fontSize: '12px', color: '#636e72', fontStyle: 'italic' }}>
                        Member details not available
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Display group preferences/profile data */}
                {group.preferences && (
                  <div style={{ marginBottom: '15px' }}>
                    <p style={{ fontSize: '13px', color: '#636e72', marginBottom: '8px', fontWeight: '600' }}>
                      Group Lifestyle & Preferences:
                    </p>
                    <div style={{ 
                      background: 'rgba(149, 165, 166, 0.05)', 
                      padding: '12px', 
                      borderRadius: '8px',
                      border: '1px solid rgba(149, 165, 166, 0.1)'
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        {group.preferences.minAge && group.preferences.maxAge && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Age Range:</strong> {group.preferences.minAge}-{group.preferences.maxAge}
                          </div>
                        )}
                        {group.preferences.maxRent && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Max Rent:</strong> ${group.preferences.maxRent}
                          </div>
                        )}
                        {group.preferences.cleanlinessLevel && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Cleanliness:</strong> {group.preferences.cleanlinessLevel}/5
                          </div>
                        )}
                        {group.preferences.noiseTolerance && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Noise Level:</strong> {group.preferences.noiseTolerance}/5
                          </div>
                        )}
                        {typeof group.preferences.petFriendly === 'boolean' && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Pet Friendly:</strong> {group.preferences.petFriendly ? 'Yes' : 'No'}
                          </div>
                        )}
                        {typeof group.preferences.smokingAllowed === 'boolean' && (
                          <div style={{ fontSize: '11px', color: '#2d3436' }}>
                            <strong>Smoking:</strong> {group.preferences.smokingAllowed ? 'Allowed' : 'Not allowed'}
                          </div>
                        )}
                      </div>
                      {group.preferences.location && (
                        <div style={{ fontSize: '11px', color: '#2d3436' }}>
                          <strong>Location:</strong> {group.preferences.location.city}, {group.preferences.location.state}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <p style={{ fontSize: '12px', color: '#636e72', marginBottom: '15px' }}>
                  Invited you on {new Date(groupMatch.createdAt).toLocaleDateString()}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-success"
                    onClick={() => {
                      console.log('Accepting group match:', groupMatch.id);
                      onAcceptMatch(groupMatch.id);
                    }}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    Join Group
                  </button>
                  {onDeclineMatch && (
                    <button
                      className="btn btn-danger"
                      onClick={() => {
                        console.log('Declining group match:', groupMatch.id);
                        if (groupMatch.id && onDeclineMatch) {
                          onDeclineMatch(groupMatch.id);
                        } else {
                          console.error('Group match ID is undefined or decline handler missing!');
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


      {pendingMatches.length === 0 && groupCreatedMatches.length === 0 && groupMatches.length === 0 && (
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
