/**
 * MESSAGING INTERFACE COMPONENT - Real-time chat system for matched users
 * Displays conversation list with match partners and provides message history.
 * Handles real-time message sending/receiving via API endpoints and potential Socket.io.
 * Shows conversation threads, message timestamps, and user info for each match.
 * Manages message state, conversation selection, and user profile popups for matches.
 */
import React, { useState, useEffect } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';

interface MessagingInterfaceProps {
  currentUser: User;
}

interface Conversation {
  id: string;
  matchId: string;
  otherUser: {
    id: string;
    name: string;
    photo: string | null;
    email: string;
  };
  lastMessage: any;
  updatedAt: string;
}

interface Message {
  _id: string;
  senderId: any;
  receiverId?: string;
  content: string;
  createdAt: string;
}

const MessagingInterface: React.FC<MessagingInterfaceProps> = ({ currentUser }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, [currentUser]);

  const loadConversations = async () => {
    try {
      console.log('Loading conversations...');
      const response = await fetch('/api/conversations', {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const conversationsData = await response.json();
        console.log('Loaded conversations:', conversationsData);
        setConversations(conversationsData);
      } else {
        console.error('Failed to load conversations');
        setConversations([]);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const selectConversation = async (conversationId: string) => {
    setSelectedConversation(conversationId);
    await loadMessages(conversationId);
  };

  const loadMessages = async (conversationId: string) => {
    try {
      console.log('Loading messages for conversation:', conversationId);
      const response = await fetch(`/api/messages/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const messagesData = await response.json();
        console.log('Loaded messages:', messagesData);
        setMessages(messagesData);
      } else {
        console.error('Failed to load messages');
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    try {
      const conversation = conversations.find(c => c.id === selectedConversation);
      if (!conversation) return;

      console.log('Sending message to:', conversation.otherUser.id);
      
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({
          receiverId: conversation.otherUser.id,
          content: newMessage.trim()
        })
      });

      if (response.ok) {
        const sentMessage = await response.json();
        console.log('Message sent:', sentMessage);
        
        setNewMessage('');
        // Reload messages to get the updated list
        await loadMessages(selectedConversation);
      } else {
        console.error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const loadUserProfile = async (userId: string) => {
    setProfileLoading(true);
    try {
      const response = await fetch(`/api/user/${userId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setShowProfile(userData);
      } else {
        console.error('Failed to load user profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleRequestGroup = async () => {
    if (!showProfile) return;
    
    try {
      // Find the match ID for this conversation
      const conversation = conversations.find(c => c.otherUser.id === showProfile.id);
      if (!conversation) return;
      
      const groupName = `${currentUser.getName()} & ${showProfile.name}'s Group`;
      const groupDescription = 'A new group for roommate matching';
      
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          memberIds: [currentUser.getId(), showProfile.id],
          preferences: currentUser.getPreferences()
        })
      });
      
      if (response.ok) {
        alert('Group created successfully!');
        setShowProfile(null);
      } else {
        console.error('Failed to create group');
        alert('Failed to create group. Please try again.');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Error creating group. Please try again.');
    }
  };

  const handleUnmatch = async () => {
    if (!showProfile) return;
    
    if (!confirm(`Are you sure you want to unmatch with ${showProfile.name}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      // Find the match for this user
      const conversation = conversations.find(c => c.otherUser.id === showProfile.id);
      if (!conversation) return;
      
      const response = await fetch(`/api/matches/${conversation.matchId}/unmatch`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        alert('Successfully unmatched!');
        setShowProfile(null);
        setSelectedConversation(null);
        // Reload conversations to remove the unmatched user
        loadConversations();
      } else {
        console.error('Failed to unmatch');
        alert('Failed to unmatch. Please try again.');
      }
    } catch (error) {
      console.error('Error unmatching:', error);
      alert('Error unmatching. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <h2>Loading conversations...</h2>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="empty-state">
        <h2>No Conversations</h2>
        <p>Accept matches to start conversations!</p>
      </div>
    );
  }

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  return (
    <div style={{ color: 'white', height: '80vh', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Messages</h2>
      
      <div style={{ display: 'flex', height: '100%', gap: '20px' }}>
        {/* Conversations List */}
        <div style={{ width: '300px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '15px' }}>
          <h3 style={{ marginBottom: '15px', fontSize: '18px' }}>Conversations</h3>
          <div style={{ maxHeight: 'calc(100% - 50px)', overflowY: 'auto' }}>
            {conversations.map(conversation => (
              <div
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: selectedConversation === conversation.id 
                    ? 'rgba(255, 255, 255, 0.2)' 
                    : 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={conversation.otherUser.photo || '/default_user.png'}
                    alt={conversation.otherUser.name}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      objectFit: 'cover'
                    }}
                  />
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>
                      {conversation.otherUser.name}
                    </h4>
                    <p style={{ 
                      margin: 0, 
                      fontSize: '12px', 
                      color: '#ddd'
                    }}>
                      Click to start chatting!
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '15px' }}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)', paddingBottom: '10px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>
                  {selectedConv?.otherUser.name}
                </h3>
                <button
                  onClick={() => selectedConv && loadUserProfile(selectedConv.otherUser.id)}
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

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#ddd', padding: '20px' }}>
                    No messages yet. Start the conversation!
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
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '8px 12px',
                          borderRadius: '12px',
                          background: message.senderId._id === currentUser.getId() 
                            ? '#6c5ce7' 
                            : 'rgba(255, 255, 255, 0.2)',
                          color: 'white'
                        }}
                      >
                        <p style={{ margin: '0 0 4px 0' }}>{message.content}</p>
                        <span style={{ fontSize: '10px', opacity: 0.7 }}>
                          {formatTime(message.createdAt)}
                        </span>
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
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ddd' }}>
              Select a conversation to start chatting
            </div>
          )}
        </div>
      </div>

      {/* Profile Modal */}
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
              <h2 style={{ margin: 0, color: '#2d3436' }}>{showProfile.name}'s Profile</h2>
              <button 
                onClick={() => setShowProfile(null)}
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
            
            {/* Profile Image */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <img
                src={showProfile.photos?.[0] || '/default_user.png'}
                alt={showProfile.name}
                style={{
                  width: '150px',
                  height: '150px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid #ddd'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default_user.png';
                }}
              />
            </div>

            {/* Basic Info */}
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#2d3436' }}>{showProfile.name}</h3>
              <p style={{ color: '#636e72', margin: '0 0 8px 0' }}>
                {showProfile.age} years old • {showProfile.gender}
              </p>
              <p style={{ color: '#636e72', margin: '0', fontSize: '14px' }}>
                {showProfile.email}
              </p>
            </div>

            {/* Bio */}
            {showProfile.bio && (
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ color: '#2d3436', marginBottom: '10px' }}>About</h4>
                <p style={{ color: '#636e72', lineHeight: '1.5' }}>{showProfile.bio}</p>
              </div>
            )}

            {/* Preferences */}
            {showProfile.preferences && (
              <div style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2d3436', marginBottom: '15px' }}>Preferences</h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  background: '#f8f9fa',
                  padding: '15px',
                  borderRadius: '8px'
                }}>
                  <div><strong>Age Range:</strong> {showProfile.preferences.minAge}-{showProfile.preferences.maxAge}</div>
                  <div><strong>Max Rent:</strong> ${showProfile.preferences.maxRent}</div>
                  <div><strong>Cleanliness:</strong> {showProfile.preferences.cleanlinessLevel}/5</div>
                  <div><strong>Noise Tolerance:</strong> {showProfile.preferences.noiseTolerance}/5</div>
                  <div><strong>Pet Friendly:</strong> {showProfile.preferences.petFriendly ? 'Yes' : 'No'}</div>
                  <div><strong>Smoking:</strong> {showProfile.preferences.smokingAllowed ? 'Yes' : 'No'}</div>
                </div>
                {showProfile.preferences.location && (
                  <div style={{ marginTop: '10px', color: '#636e72' }}>
                    <strong>Location:</strong> {showProfile.preferences.location.city}, {showProfile.preferences.location.state}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              <button
                onClick={handleRequestGroup}
                style={{
                  background: '#00b894',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'background 0.2s ease'
                }}
                onMouseOver={(e) => (e.target as HTMLButtonElement).style.background = '#00a085'}
                onMouseOut={(e) => (e.target as HTMLButtonElement).style.background = '#00b894'}
              >
                Request Group
              </button>
              <button
                onClick={handleUnmatch}
                style={{
                  background: '#e17055',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 24px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'background 0.2s ease'
                }}
                onMouseOver={(e) => (e.target as HTMLButtonElement).style.background = '#d63031'}
                onMouseOut={(e) => (e.target as HTMLButtonElement).style.background = '#e17055'}
              >
                Unmatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal */}
      {profileLoading && (
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
          zIndex: 999
        }}>
          <div style={{
            background: 'white',
            borderRadius: '10px',
            padding: '30px',
            textAlign: 'center',
            color: 'black'
          }}>
            Loading profile...
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagingInterface;