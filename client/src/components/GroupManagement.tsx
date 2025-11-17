/**
 * GROUP MANAGEMENT COMPONENT - Interface for managing roommate groups and voting
 * Displays user's group information, member lists, and pending member proposals.
 * Handles group voting system for adding new members with democratic approval process.
 * Shows group preferences, member photos, and voting status for pending additions.
 * NOTE: Currently uses legacy ProfileManager/MatchingSystem classes that may need API integration.
 */
import React, { useState } from 'react';
import { User } from '../classes/User';
import { Group } from '../classes/Group';
// import { ProfileManager } from '../classes/ProfileManager';
// import { MatchingSystem } from '../classes/MatchingSystem';
import defaultUserImage from '../images/default_user.png';

interface GroupManagementProps {
  currentUser: User;
  // profileManager: ProfileManager;
  // matchingSystem: MatchingSystem;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ 
  currentUser
  // profileManager
  // matchingSystem 
}) => {
  const [showProposeMember, setShowProposeMember] = useState(false);
  const [proposedUserId, setProposedUserId] = useState('');
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);

  // Get user's groups
  React.useEffect(() => {
    // TODO: Replace with API calls when integrating with backend
    setUserGroups([]);
    setAvailableUsers([]);
    // if (currentUser.getGroupId()) {
    //   const group = profileManager.getGroup(currentUser.getGroupId()!);
    //   if (group) {
    //     setUserGroups([group]);
    //   }
    // } else {
    //   setUserGroups([]);
    // }
    
    // Get available users for proposing
    // const available = profileManager.getIndividualUsers().filter((user: User) => 
    //   user.getId() !== currentUser.getId()
    // );
    // setAvailableUsers(available);
  }, [currentUser]);

  const handleProposeMember = () => {
    // TODO: Replace with API call to backend
    alert('Group management not yet integrated with backend API');
    // if (!proposedUserId || !currentUser.getGroupId()) return;
    
    // const group = profileManager.getGroup(currentUser.getGroupId()!);
    // if (!group) return;
    
    // try {
    //   group.proposeMember(proposedUserId, currentUser.getId());
    //   setShowProposeMember(false);
    //   setProposedUserId('');
    //   alert('Member proposed successfully! Other group members can now vote.');
    // } catch (error) {
    //   alert(error instanceof Error ? error.message : 'Failed to propose member');
    // }
  };

  const handleVote = (proposedUserId: string, vote: 'yes' | 'no') => {
    // TODO: Replace with API call to backend
    alert('Group voting not yet integrated with backend API');
    // if (!currentUser.getGroupId()) return;
    
    // const group = profileManager.getGroup(currentUser.getGroupId()!);
    // if (!group) return;
    
    // try {
    //   group.voteOnMember(proposedUserId, currentUser.getId(), vote);
      
    //   // Check if member is accepted
    //   if (group.isMemberAccepted(proposedUserId)) {
    //     profileManager.addMemberToGroup(group.getId(), proposedUserId);
    //     group.clearPendingVotes(proposedUserId);
    //     alert('Member added to group!');
    //   } else {
    //     alert('Vote recorded!');
    //   }
    // } catch (error) {
    //   alert(error instanceof Error ? error.message : 'Failed to vote');
    // }
  };

  const handleLeaveGroup = () => {
    // TODO: Replace with API call to backend
    alert('Leave group functionality not yet integrated with backend API');
    // if (!currentUser.getGroupId()) return;
    
    // if (confirm('Are you sure you want to leave this group?')) {
    //   profileManager.removeMemberFromGroup(currentUser.getGroupId()!, currentUser.getId());
    //   setUserGroups([]);
    //   alert('You have left the group.');
    // }
  };

  if (userGroups.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Groups</h2>
        <p>You're not currently in any groups. Create a group with a match to get started!</p>
      </div>
    );
  }

  const group = userGroups[0];
  const members: User[] = []; // TODO: Replace with API call to get group members
  const pendingProposals: string[] = []; // TODO: Replace with API call to get pending proposals

  return (
    <div style={{ color: 'white' }}>
      <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Group Management</h2>
      
      {/* Group Info */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <h3 style={{ marginBottom: '10px', color: '#74b9ff' }}>{group.getName()}</h3>
        <p style={{ marginBottom: '15px', color: '#636e72' }}>{group.getDescription()}</p>
        
        <div className="preferences" style={{ marginBottom: '15px' }}>
          <span className="preference-tag">Max Rent: ${group.getPreferences().maxRent}</span>
          <span className="preference-tag">Cleanliness: {group.getPreferences().cleanlinessLevel}/5</span>
          <span className="preference-tag">Noise: {group.getPreferences().noiseTolerance}/5</span>
          {group.getPreferences().petFriendly && (
            <span className="preference-tag">Pet Friendly</span>
          )}
          {group.getPreferences().smokingAllowed && (
            <span className="preference-tag">Smoking OK</span>
          )}
        </div>
        
        <button
          className="btn btn-danger"
          onClick={handleLeaveGroup}
          style={{ fontSize: '14px', padding: '8px 16px' }}
        >
          Leave Group
        </button>
      </div>

      {/* Group Members */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <h3 style={{ marginBottom: '15px', color: '#00b894' }}>Members ({members.length})</h3>
        {members.map(member => (
          <div key={member.getId()} style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '10px',
            padding: '10px',
            background: '#f8f9fa',
            borderRadius: '8px'
          }}>
            <img
              src={member.getPhotos()[0] || defaultUserImage}
              alt={member.getName()}
              style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '10px' }}
            />
            <div>
              <p style={{ fontWeight: '600', margin: 0, color: '#2d3436' }}>{member.getName()}</p>
              <p style={{ fontSize: '12px', margin: 0, color: '#636e72' }}>{member.getAge()} years old</p>
            </div>
          </div>
        ))}
      </div>

      {/* Propose New Member */}
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <h3 style={{ marginBottom: '15px', color: '#fdcb6e' }}>Propose New Member</h3>
        <button
          className="btn btn-primary"
          onClick={() => setShowProposeMember(true)}
          style={{ fontSize: '14px', padding: '8px 16px' }}
        >
          Propose Member
        </button>
      </div>

      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
          <h3 style={{ marginBottom: '15px', color: '#e17055' }}>Pending Proposals</h3>
          {pendingProposals.map(proposedUserId => {
            // TODO: Replace with API call to get user by ID
            return (
              <div key={proposedUserId} style={{ 
                marginBottom: '15px',
                padding: '15px',
                background: '#f8f9fa',
                borderRadius: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                  <img
                    src={defaultUserImage}
                    alt="Pending User"
                    style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '10px' }}
                  />
                  <div>
                    <p style={{ fontWeight: '600', margin: 0, color: '#2d3436' }}>Pending User</p>
                    <p style={{ fontSize: '12px', margin: 0, color: '#636e72' }}>Age unknown</p>
                  </div>
                </div>
                
                <p style={{ fontSize: '14px', color: '#636e72', marginBottom: '10px' }}>
                  Votes: 0 yes, 0 no (0/0 required)
                </p>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    className="btn btn-success"
                    onClick={() => handleVote(proposedUserId as string, 'yes')}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Vote Yes
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleVote(proposedUserId as string, 'no')}
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                  >
                    Vote No
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Propose Member Modal */}
      {showProposeMember && (
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
          <div className="card" style={{ padding: '30px', maxWidth: '500px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ marginBottom: '20px', textAlign: 'center' }}>Propose New Member</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Select User
              </label>
              <select
                value={proposedUserId}
                onChange={(e) => setProposedUserId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '16px'
                }}
              >
                <option value="">Choose a user...</option>
                {availableUsers.map(user => (
                  <option key={user.getId()} value={user.getId()}>
                    {user.getName()} ({user.getAge()}) - {user.getBio().substring(0, 50)}...
                  </option>
                ))}
              </select>
            </div>

            {proposedUserId && (
              <div style={{ marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                {(() => {
                  const user = availableUsers.find(u => u.getId() === proposedUserId);
                  if (!user) return null;
                  
                  return (
                    <div>
                      <h4 style={{ marginBottom: '10px' }}>User Profile</h4>
                      <p><strong>Name:</strong> {user.getName()}</p>
                      <p><strong>Age:</strong> {user.getAge()}</p>
                      <p><strong>Bio:</strong> {user.getBio()}</p>
                      <div className="preferences" style={{ marginTop: '10px' }}>
                        <span className="preference-tag">Max Rent: ${user.getPreferences().maxRent}</span>
                        <span className="preference-tag">Cleanliness: {user.getPreferences().cleanlinessLevel}/5</span>
                        <span className="preference-tag">Noise: {user.getPreferences().noiseTolerance}/5</span>
                        {user.getPreferences().petFriendly && (
                          <span className="preference-tag">Pet Friendly</span>
                        )}
                        {user.getPreferences().smokingAllowed && (
                          <span className="preference-tag">Smoking OK</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowProposeMember(false);
                  setProposedUserId('');
                }}
                style={{ fontSize: '14px', padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-success"
                onClick={handleProposeMember}
                disabled={!proposedUserId}
                style={{ fontSize: '14px', padding: '8px 16px' }}
              >
                Propose Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupManagement;
