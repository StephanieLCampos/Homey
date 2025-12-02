/**
 * SEARCH COMPONENT - User search and group invitation functionality
 * Allows users to search for other users by email address
 * Provides group invitation functionality for users in groups
 * Shows user profiles and handles group join requests
 */
import React, { useState, useEffect } from 'react';
import { authService } from '../services/authService';

interface SearchResult {
  id: string;
  _id?: string;
  email: string;
  name: string;
  age: number;
  gender: string;
  bio?: string;
  photos?: string[];
  isActive: boolean;
  groupId?: string;
}

interface SearchProps {
  currentUser: any;
}

const Search: React.FC<SearchProps> = ({ currentUser }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [userGroup, setUserGroup] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set()); // Track sent requests by user ID

  // Check if current user is in a group
  useEffect(() => {
    checkUserGroup();
  }, [currentUser]);

  const checkUserGroup = async () => {
    if (!currentUser || !currentUser.getId()) return;

    try {
      const response = await fetch(`/api/user/${currentUser.getId()}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.groupId) {
          // Fetch group details
          const groupResponse = await fetch(`/api/groups/${userData.groupId}`, {
            headers: {
              'Authorization': `Bearer ${authService.getToken()}`
            }
          });
          if (groupResponse.ok) {
            const groupData = await groupResponse.json();
            setUserGroup(groupData);
          } else {
            setUserGroup(null);
          }
        } else {
          setUserGroup(null);
        }
      } else {
      }
    } catch (error) {
      console.error('Error checking user group:', error);
    }
  };

  // Check if user's group is full
  const isGroupFull = (): boolean => {
    if (!userGroup) return false;
    return userGroup.memberIds?.length >= userGroup.maxMembers;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchEmail.trim()) return;

    setIsSearching(true);
    setSearchPerformed(true);
    setSentRequests(new Set()); // Clear previous sent requests when starting new search
    
    try {
      const response = await fetch(`/api/users/search?email=${encodeURIComponent(searchEmail.trim())}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });

      if (response.ok) {
        const results = await response.json();
        setSearchResults(Array.isArray(results) ? results : []);
      } else {
        console.error('Search failed:', response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const sendGroupInvite = async (targetUserId: string, targetUserName: string) => {
    setLoading(true);
    try {
      if (userGroup) {
        // User is in a group - invite to existing group
        const response = await fetch(`/api/groups/${userGroup._id || userGroup.id}/invite`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken()}`
          },
          body: JSON.stringify({
            targetUserId: targetUserId,
            message: `Hi ${targetUserName}! I'd like to invite you to join our group "${userGroup.name}".`
          })
        });

        if (response.ok) {
          alert(`Invitation sent to ${targetUserName} to join your group!`);
          // Mark this user as having received an invitation
          setSentRequests(prev => new Set(prev).add(targetUserId));
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Failed to send invitation' }));
          alert(`Failed to send invitation: ${errorData.error || 'Unknown error'}`);
        }
      } else {
        // User is not in a group - send regular match request (like swipe right)
        const response = await fetch(`/api/swipe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken()}`
          },
          body: JSON.stringify({
            targetUserId: targetUserId,
            action: 'like'
          })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.match) {
            alert(`🎉 It's a match! ${targetUserName} had already liked you too!`);
          } else {
            alert(`Match request sent to ${targetUserName}!`);
          }
          // Mark this user as having received a match request
          setSentRequests(prev => new Set(prev).add(targetUserId));
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Failed to send match request' }));
          alert(`Failed to send match request: ${errorData.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error sending group invite:', error);
      alert('Failed to send invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show group full message if user's group is at capacity
  if (isGroupFull()) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{
          textAlign: 'center',
          padding: '60px 40px',
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
          border: '1px solid rgba(0, 0, 0, 0.08)'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>🚫</div>
          <h3 style={{ 
            fontSize: '24px', 
            color: '#333', 
            fontWeight: '600', 
            marginBottom: '16px',
            margin: '0 0 16px 0'
          }}>
            Group is Full
          </h3>
          <p style={{ 
            fontSize: '16px', 
            color: '#666', 
            lineHeight: '1.6',
            margin: '0 0 20px 0'
          }}>
            Sorry, your group is full. You can no longer add others to the group.
          </p>
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #e9ecef'
          }}>
            <p style={{ 
              fontSize: '14px', 
              color: '#666', 
              margin: '0'
            }}>
              Your search functionality has been paused because your group has reached its maximum capacity.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#2c3e50' }}>
        Search Users
      </h2>

      {userGroup ? (
        <div style={{
          background: '#e8f5e8',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #27ae60'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#27ae60' }}>Your Group: {userGroup.name}</h3>
          <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>
            You can invite users to join your existing group
          </p>
        </div>
      ) : (
        <div style={{
          background: '#e3f2fd',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #2196f3'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#1976d2' }}>Send Match Requests</h3>
          <p style={{ margin: '0', fontSize: '14px', color: '#555' }}>
            You can send match requests to users. If they like you back, you'll be matched!
          </p>
        </div>
      )}

      <form onSubmit={handleSearch} style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="email"
            value={searchEmail}
            onChange={(e) => setSearchEmail(e.target.value)}
            placeholder="Enter email address to search..."
            style={{
              flex: 1,
              padding: '12px',
              border: '2px solid #ddd',
              borderRadius: '8px',
              fontSize: '16px'
            }}
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching || !searchEmail.trim()}
            style={{
              padding: '12px 24px',
              background: isSearching ? '#bdc3c7' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {searchPerformed && (
        <div>
          {searchResults.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              background: '#f8f9fa',
              borderRadius: '8px',
              color: '#6c757d'
            }}>
              <h3>No users found</h3>
              <p>No users found with the email "{searchEmail}"</p>
            </div>
          ) : (
            <div>
              <h3 style={{ marginBottom: '20px', color: '#2c3e50' }}>
                Search Results ({searchResults.length})
              </h3>
              {searchResults.map((user) => (
                <div
                  key={user.id || user._id}
                  style={{
                    background: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '15px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 5px 0', color: '#2c3e50' }}>
                        {user.name}
                      </h4>
                      <p style={{ margin: '0 0 5px 0', color: '#7f8c8d', fontSize: '14px' }}>
                        {user.email}
                      </p>
                      <p style={{ margin: '0 0 10px 0', color: '#555', fontSize: '14px' }}>
                        {user.age} years old • {user.gender}
                      </p>
                      {user.bio && (
                        <p style={{ margin: '0 0 10px 0', color: '#666', fontSize: '14px' }}>
                          {user.bio}
                        </p>
                      )}
                      
                      {user.groupId && (
                        <div style={{
                          background: '#fff3cd',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ffeaa7',
                          marginTop: '10px'
                        }}>
                          <span style={{ fontSize: '12px', color: '#856404' }}>
                            ⚠️ Already in a group
                          </span>
                        </div>
                      )}
                      
                      {!user.isActive && (
                        <div style={{
                          background: '#f8d7da',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #f5c6cb',
                          marginTop: '10px'
                        }}>
                          <span style={{ fontSize: '12px', color: '#721c24' }}>
                            ❌ Inactive user
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {user.isActive && !user.groupId && (() => {
                      const userId = user.id || user._id!;
                      const hasRequestSent = sentRequests.has(userId);
                      
                      return (
                        <button
                          onClick={() => sendGroupInvite(userId, user.name)}
                          disabled={loading || hasRequestSent}
                          style={{
                            background: hasRequestSent 
                              ? '#32cd32' // Frog green for sent requests
                              : loading 
                                ? '#bdc3c7' 
                                : (userGroup ? '#27ae60' : '#2196f3'),
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            cursor: (loading || hasRequestSent) ? 'not-allowed' : 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {hasRequestSent 
                            ? (userGroup ? 'Group invite sent!' : 'Match request sent!')
                            : loading 
                              ? 'Sending...' 
                              : (userGroup ? 'Send Group Invite' : 'Send Match Request')
                          }
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Search;