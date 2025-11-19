/**
 * GROUP MANAGEMENT COMPONENT - Interface for managing group conversations and members
 * Displays group chat interface when user is in a group, showing member list and messages.
 * Handles group messaging, member management, and leave group functionality.
 * Integrates with backend API for real-time group communications and status updates.
 * Replaces individual messaging interface when users form groups through group requests.
 */
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';
import { io, Socket } from 'socket.io-client';

interface GroupManagementProps {
  currentUser: User;
}

interface GroupConversation {
  id: string;
  groupId: string;
  groupName: string;
  members: {
    id: string;
    name: string;
    photo: string | null;
    email: string;
  }[];
  lastMessage: any;
  updatedAt: string;
  isGroup: boolean;
}

interface Message {
  _id: string;
  senderId: any;
  groupId?: string;
  content: string;
  createdAt: string;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ currentUser }) => {
  const [groupConversation, setGroupConversation] = useState<GroupConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showGroupProfile, setShowGroupProfile] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [groupData, setGroupData] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [joinRequests, setJoinRequests] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    console.log('GroupManagement useEffect triggered for user:', currentUser.getId());
    loadGroupConversation();
    
    // Try to initialize socket, but don't block if it fails
    try {
      initializeSocket();
    } catch (error) {
      console.log('Failed to initialize socket, continuing without real-time features');
    }
    
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch (error) {
          console.log('Error disconnecting socket:', error);
        }
      }
    };
  }, [currentUser.getId()]); // Depend on user ID to force reload when user changes

  const initializeSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    try {
      const token = authService.getToken();
      if (!token) {
        console.log('No auth token available, skipping socket connection');
        return;
      }

      socketRef.current = io(window.location.origin.replace('3000', '3333'), {
        auth: {
          token: token
        },
        transports: ['polling', 'websocket'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000
      });

      socketRef.current.on('connect', () => {
        console.log('Group socket connected');
        socketRef.current?.emit('join', currentUser.getId());
      });

      socketRef.current.on('connect_error', (error) => {
        console.log('Socket connection error:', error.message);
        if (error.message.includes('Authentication error') || error.message.includes('401')) {
          console.log('Socket authentication failed, will continue without real-time features');
          // Don't retry if it's an auth error
          socketRef.current?.disconnect();
        }
        // Don't alert users about socket errors - the app can work without real-time updates
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
      });

      socketRef.current.on('message', (newMessage: Message) => {
      console.log('New group message received:', newMessage);
      
      // Add message if it's for our group and it's not from the current user
      // (to avoid duplicate messages since we already add our own messages immediately)
      if (groupConversation && 
          newMessage.groupId === groupConversation.groupId &&
          newMessage.senderId._id !== currentUser.getId()) {
        setMessages(prevMessages => [...prevMessages, newMessage]);
      }
    });

    // Listen for join requests sent to the group and refresh the list when received
    socketRef.current.on('groupJoinRequest', (data: any) => {
      try {
        console.log('Received groupJoinRequest socket event:', data);
        // If we're viewing the same group conversation, reload join requests
        if (groupConversation && data.groupId === groupConversation.groupId) {
          loadJoinRequests(data.groupId);
        } else {
          // Otherwise, still attempt to refresh if groupData matches
          if (groupData && groupData._id && data.groupId === groupData._id) {
            loadJoinRequests(data.groupId);
          }
        }
      } catch (err) {
        console.error('Error handling groupJoinRequest socket event', err);
      }
    });

    socketRef.current.on('memberLeft', (data: any) => {
      console.log('Member left group:', data);
      alert(`${data.leftUserName} has left the group.`);
      loadGroupConversation(); // Reload to update member list
    });

      socketRef.current.on('groupDissolved', (data: any) => {
        console.log('Group dissolved:', data);
        alert(data.message);
        setGroupConversation(null);
        setMessages([]);
      });
    } catch (error) {
      console.error('Socket initialization error:', error);
      // Continue without socket - app will work but without real-time updates
    }
  };

  const loadGroupData = async (groupId: string) => {
    try {
      console.log('Loading group data for groupId:', groupId);
      const response = await fetch(`/api/groups/${groupId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      console.log('Group data response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Group data loaded:', data);
        setGroupData(data);
    // Load join requests for group members
    loadJoinRequests(data._id);
        setEditData({
          name: data.name || '',
          description: data.description || '',
          preferences: data.preferences || {}
        });
      } else {
        const errorText = await response.text();
        console.error('Failed to load group data:', response.status, errorText);
        alert(`Failed to load group data: ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading group data:', error);
      alert('Error loading group data. Please try again.');
    }
  };

  const loadJoinRequests = async (groupId: string) => {
    try {
      const resp = await fetch(`/api/groups/${groupId}/join-requests`, {
        headers: { 'Authorization': `Bearer ${authService.getToken()}` }
      });
      if (resp.ok) {
        const body = await resp.json();
        setJoinRequests(body.requests || []);
      } else {
        setJoinRequests([]);
      }
    } catch (err) {
      console.error('Failed to load join requests:', err);
      setJoinRequests([]);
    }
  };

  const loadGroupConversation = async () => {
    try {
      const response = await fetch('/api/group-conversations', {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const conversations = await response.json();
        if (conversations.length > 0) {
            setGroupConversation(conversations[0]);
            await loadGroupMessages(conversations[0].groupId);
            // Load join requests for this conversation's group so members immediately see pending requests
            try {
              await loadJoinRequests(conversations[0].groupId);
            } catch (err) {
              console.error('Error loading join requests on conversation load', err);
            }
        } else {
          setGroupConversation(null);
          setMessages([]);
        }
      } else {
        console.error('Failed to load group conversations');
        setGroupConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading group conversations:', error);
      setGroupConversation(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupMessages = async (groupId: string) => {
    try {
      const response = await fetch(`/api/messages/group/${groupId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const messagesData = await response.json();
        setMessages(messagesData);
      } else {
        console.error('Failed to load group messages');
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading group messages:', error);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !groupConversation) return;

    const messageContent = newMessage.trim();
    setNewMessage(''); // Clear input immediately

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({
          groupId: groupConversation.groupId,
          content: messageContent
        })
      });

      if (response.ok) {
        const savedMessage = await response.json();
        console.log('Message sent successfully:', savedMessage);
        
        // Immediately add the message to local state so it appears instantly
        setMessages(prevMessages => [...prevMessages, savedMessage]);
      } else {
        console.error('Failed to send message');
        alert('Failed to send message. Please try again.');
        // Restore message content if sending failed
        setNewMessage(messageContent);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error sending message. Please try again.');
      // Restore message content if sending failed
      setNewMessage(messageContent);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEditChange = (field: string, value: any) => {
    if (field.startsWith('preferences.')) {
      const prefKey = field.split('preferences.')[1];
      setEditData((prev: any) => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          [prefKey]: value
        }
      }));
    } else {
      setEditData((prev: any) => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleSaveGroupProfile = async () => {
    if (!groupConversation || !editData) return;

    try {
      const response = await fetch(`/api/groups/${groupConversation.groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(editData)
      });

      if (response.ok) {
        const updatedGroup = await response.json();
        setGroupData(updatedGroup);
        setShowEditProfile(false);
        alert('Group profile updated successfully!');
        // Refresh group conversation to show updated name
        loadGroupConversation();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to update group profile.');
      }
    } catch (error) {
      console.error('Error updating group profile:', error);
      alert('Error updating group profile. Please try again.');
    }
  };

  const handleOpenEditProfile = async () => {
    if (groupConversation) {
      await loadGroupData(groupConversation.groupId);
      setShowGroupProfile(false);
      setShowEditProfile(true);
    }
  };

  const handleLeaveGroup = async () => {
    if (!groupConversation) return;
    
    if (!confirm('Are you sure you want to leave this group? This will restore your individual profile and the group may be dissolved.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/groups/${groupConversation.groupId}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        setGroupConversation(null);
        setMessages([]);
      } else {
        const error = await response.json();
        console.error('Failed to leave group:', error);
        alert(error.error || 'Failed to leave group. Please try again.');
      }
    } catch (error) {
      console.error('Error leaving group:', error);
      alert('Error leaving group. Please try again.');
    }
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '400px',
        color: '#666'
      }}>
        Loading group information...
      </div>
    );
  }

  if (!groupConversation) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '60px 20px',
        color: '#666'
      }}>
        <h2 style={{ color: '#2d3436', marginBottom: '16px' }}>No Group</h2>
        <p>You are not currently in a group.</p>
        <p>Form a group by sending a group request through the Messages tab!</p>
      </div>
    );
  }

  return (
    <div style={{ color: 'white', height: '80vh', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Group Chat</h2>
      
      <div style={{
        height: '100%',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '10px',
        padding: '15px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Group Header */}
        <div style={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
          paddingBottom: '10px',
          marginBottom: '15px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ color: 'white', margin: '0 0 4px 0', fontSize: '18px' }}>
              {groupConversation.groupName}
            </h3>
            <div style={{ color: '#ddd', fontSize: '12px' }}>
              Members: {groupConversation.members.map(m => m.name).join(', ')}
            </div>
          </div>
          <button
            onClick={() => setShowGroupProfile(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Info
          </button>
        </div>

        {/* Pending Join Requests (visible to group members) */}
        {joinRequests.length > 0 && (
          <div style={{ margin: '10px 0 18px 0', padding: '12px', background: 'rgba(0,0,0,0.12)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>Pending Join Requests</h4>
            {joinRequests.map(req => (
              <div key={req._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ color: '#ddd' }}>
                  <strong style={{ color: '#fff' }}>{req.requester?.name || 'User'}</strong>
                  <div style={{ fontSize: '13px', color: '#ccc' }}>{req.message || ''}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={async () => {
                    try {
                      const r = await fetch(`/api/groups/${groupData._id}/join-request/${req._id}/respond`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
                        body: JSON.stringify({ action: 'accept' })
                      });
                      if (r.ok) {
                        await loadJoinRequests(groupData._id);
                        await loadGroupConversation();
                      } else {
                        console.error('Failed to accept join request', await r.text());
                        alert('Failed to accept request');
                      }
                    } catch (err) {
                      console.error('Accept join request error', err);
                      alert('Error accepting request');
                    }
                  }} style={{ background: '#2ecc71', border: 'none', padding: '6px 10px', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Accept</button>
                  <button onClick={async () => {
                    try {
                      const r = await fetch(`/api/groups/${groupData._id}/join-request/${req._id}/respond`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
                        body: JSON.stringify({ action: 'reject' })
                      });
                      if (r.ok) {
                        await loadJoinRequests(groupData._id);
                      } else {
                        console.error('Failed to reject join request', await r.text());
                        alert('Failed to reject request');
                      }
                    } catch (err) {
                      console.error('Reject join request error', err);
                      alert('Error rejecting request');
                    }
                  }} style={{ background: '#e74c3c', border: 'none', padding: '6px 10px', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          marginBottom: '15px'
        }}>
          {messages.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#ddd', 
              padding: '20px'
            }}>
              No messages yet. Start chatting with your group!
            </div>
          ) : (
            messages.map(message => (
              <div
                key={message._id}
                style={{
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: message.senderId._id === currentUser.getId() ? 'flex-end' : 'flex-start'
                }}
              >
                <div style={{
                  maxWidth: '70%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: message.senderId._id === currentUser.getId() ? 'flex-end' : 'flex-start'
                }}>
                  {message.senderId._id !== currentUser.getId() && (
                    <div style={{
                      fontSize: '10px',
                      color: '#ddd',
                      marginBottom: '4px',
                      paddingLeft: '8px'
                    }}>
                      {message.senderId.name}
                    </div>
                  )}
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '12px',
                      background: message.senderId._id === currentUser.getId() 
                        ? '#007bff' 
                        : '#6c757d',
                      color: 'white'
                    }}
                  >
                    <p style={{ margin: '0 0 4px 0' }}>{message.content}</p>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Message Input */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            style={{
              flex: 1,
              padding: '10px 15px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              border: 'none',
              background: '#6c5ce7',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              opacity: newMessage.trim() ? 1 : 0.5
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Group Profile Modal */}
      {showGroupProfile && groupConversation && (
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
          <div style={{
            background: 'white',
            borderRadius: '15px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            color: 'black'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2d3436' }}>Group Profile</h2>
              <button 
                onClick={() => setShowGroupProfile(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#636e72',
                  padding: '0'
                }}
              >
                ×
              </button>
            </div>
            
            {/* Group Name */}
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#2d3436' }}>{groupConversation.groupName}</h3>
              <p style={{ color: '#636e72', margin: '0', fontSize: '14px' }}>
                Created: {new Date(groupConversation.updatedAt).toLocaleDateString()}
              </p>
            </div>

            {/* Members */}
            <div style={{ marginBottom: '25px' }}>
              <h4 style={{ color: '#2d3436', marginBottom: '15px' }}>Members ({groupConversation.members.length})</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {groupConversation.members.map(member => (
                  <div key={member.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    padding: '8px',
                    background: '#f8f9fa',
                    borderRadius: '8px'
                  }}>
                    <img
                      src={member.photo || '/default_user.png'}
                      alt={member.name}
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        objectFit: 'cover'
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: '600', color: '#2d3436' }}>{member.name}</div>
                      <div style={{ fontSize: '12px', color: '#636e72' }}>{member.email}</div>
                    </div>
                    {member.id === currentUser.getId() && (
                      <span style={{ 
                        marginLeft: 'auto',
                        fontSize: '12px',
                        color: '#00b894',
                        fontWeight: '600'
                      }}>
                        You
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={handleOpenEditProfile}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #0984e3',
                  background: 'white',
                  color: '#0984e3',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
                onMouseOver={(e) => {
                  (e.target as HTMLButtonElement).style.background = '#0984e3';
                  (e.target as HTMLButtonElement).style.color = 'white';
                }}
                onMouseOut={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'white';
                  (e.target as HTMLButtonElement).style.color = '#0984e3';
                }}
              >
                Edit Group Profile
              </button>
              <button
                onClick={() => {
                  setShowGroupProfile(false);
                  handleLeaveGroup();
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#e17055',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
                onMouseOver={(e) => (e.target as HTMLButtonElement).style.background = '#d63031'}
                onMouseOut={(e) => (e.target as HTMLButtonElement).style.background = '#e17055'}
              >
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Profile Modal */}
      {showEditProfile && editData && (
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
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            borderRadius: '15px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            color: 'black'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#2d3436' }}>Edit Group Profile</h2>
              <button 
                onClick={() => setShowEditProfile(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#636e72',
                  padding: '0'
                }}
              >
                ×
              </button>
            </div>
            
            {/* Basic Information */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ color: '#2d3436', marginBottom: '15px' }}>Basic Information</h3>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                  Group Name:
                </label>
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => handleEditChange('name', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                  maxLength={100}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                  Description:
                </label>
                <textarea
                  value={editData.description}
                  onChange={(e) => handleEditChange('description', e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                  maxLength={500}
                  placeholder="Describe your group..."
                />
              </div>
            </div>

            {/* Group Preferences */}
            {editData.preferences && (
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ color: '#2d3436', marginBottom: '15px' }}>Group Preferences</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Min Age:
                    </label>
                    <input
                      type="number"
                      value={editData.preferences.minAge || ''}
                      onChange={(e) => handleEditChange('preferences.minAge', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                      min="18"
                      max="100"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Max Age:
                    </label>
                    <input
                      type="number"
                      value={editData.preferences.maxAge || ''}
                      onChange={(e) => handleEditChange('preferences.maxAge', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                      min="18"
                      max="100"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Max Rent: $
                    </label>
                    <input
                      type="number"
                      value={editData.preferences.maxRent || ''}
                      onChange={(e) => handleEditChange('preferences.maxRent', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                      min="0"
                      step="50"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Cleanliness Level: {editData.preferences.cleanlinessLevel || 1}/5
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={editData.preferences.cleanlinessLevel || 1}
                      onChange={(e) => handleEditChange('preferences.cleanlinessLevel', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        margin: '5px 0'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Noise Tolerance: {editData.preferences.noiseTolerance || 1}/5
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={editData.preferences.noiseTolerance || 1}
                      onChange={(e) => handleEditChange('preferences.noiseTolerance', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        margin: '5px 0'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Pet Friendly:
                    </label>
                    <input
                      type="checkbox"
                      checked={editData.preferences.petFriendly || false}
                      onChange={(e) => handleEditChange('preferences.petFriendly', e.target.checked)}
                      style={{
                        margin: '5px 0',
                        transform: 'scale(1.2)'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                      Smoking Allowed:
                    </label>
                    <input
                      type="checkbox"
                      checked={editData.preferences.smokingAllowed || false}
                      onChange={(e) => handleEditChange('preferences.smokingAllowed', e.target.checked)}
                      style={{
                        margin: '5px 0',
                        transform: 'scale(1.2)'
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowEditProfile(false)}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #636e72',
                  background: 'white',
                  color: '#636e72',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroupProfile}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#00b894',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600'
                }}
                onMouseOver={(e) => (e.target as HTMLButtonElement).style.background = '#00a085'}
                onMouseOut={(e) => (e.target as HTMLButtonElement).style.background = '#00b894'}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupManagement;