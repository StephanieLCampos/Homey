/**
 * MESSAGING INTERFACE COMPONENT
 *
 * The Messages view: a conversation list beside the selected thread, backed by
 * both the REST API (history and sending) and a Socket.io connection (live
 * delivery and notifications).
 *
 * It is more than a chat window, because a conversation is where the group
 * relationship is negotiated. Opening a participant's profile from a thread also
 * offers, according to the two users' states: sending a group request, responding
 * to one already received, leaving a group, or unmatching. Those actions are
 * here rather than in the Groups view because the decision is made in the
 * context of the conversation that led to it.
 *
 * The socket carries far more than messages. It also delivers the events that
 * change what this view should be showing at all - `groupFormed`, `leftGroup`,
 * `groupDissolved`, `memberLeft`, `groupRequestReceived`,
 * `groupRequestRejected` - because forming or leaving a group rewrites which
 * conversations exist. Most handlers therefore reload the conversation list
 * rather than patching state in place.
 *
 * A user in a group with no conversations sees an explanation rather than an
 * empty state: group membership deliberately replaces individual messaging, and
 * the emptiness is the rule working, not a failure.
 *
 * Props:
 *   currentUser         - the signed-in user.
 *   currentUserData     - raw user record; its `status` distinguishes an empty
 *                         inbox from the group-messaging restriction.
 *   onGroupStatusChange - notifies App.tsx when an action here has changed the
 *                         user's group membership.
 *
 * Connections:
 *   - client/src/services/authService.ts - token for REST calls and the socket
 *                                          handshake.
 *   - client/src/App.tsx - the parent, which reloads app-wide state on
 *                          onGroupStatusChange.
 *   - server/index.js - /api/conversations, /api/messages,
 *                       /api/group-requests, /api/groups/:id/leave,
 *                       /api/matches/:id/unmatch, and the Socket.io server.
 *
 * Notes:
 *   - The socket URL is derived by substituting 3000 for 3333 in the page
 *     origin, which works for the local development ports but is fragile; a
 *     configured base URL would be the better arrangement.
 *   - User feedback is delivered with `alert`, including for events arriving
 *     over the socket. That is intrusive and would be replaced with in-app
 *     notifications in a production build.
 */
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';
import { io, Socket } from 'socket.io-client';

interface MessagingInterfaceProps {
  currentUser: User;
  currentUserData?: any;
  onGroupStatusChange?: () => void;
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

interface GroupRequest {
  _id: string;
  requester: {
    _id: string;
    name: string;
    photos?: string[];
  };
  recipient: {
    _id: string;
    name: string;
    photos?: string[];
  };
  status: 'pending' | 'accepted' | 'rejected';
  message: string;
  requestedAt: string;
  respondedAt?: string;
}

interface Message {
  _id: string;
  senderId: any;
  receiverId?: string;
  content: string;
  createdAt: string;
  messageType?: string;
}

const MessagingInterface: React.FC<MessagingInterfaceProps> = ({ currentUser, currentUserData, onGroupStatusChange }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [groupRequests, setGroupRequests] = useState<GroupRequest[]>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // Load the conversation list and open the socket, tearing the socket down on
  // unmount. The dependency on `currentUserData?.status` matters: joining or
  // leaving a group changes which conversations exist, so the effect must re-run
  // and rebuild both.
  useEffect(() => {
    loadConversations();
    initializeSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [currentUser, currentUserData?.status]); // Re-run when user status changes

  /**
   * Open the authenticated Socket.io connection and register every live handler.
   *
   * The token is passed in the handshake, which the server verifies before the
   * connection is accepted; on connect the client joins its own user room, which
   * is how the server addresses it.
   *
   * Handlers fall into two groups:
   *   - 'message' appends to the open thread, after checking the message belongs
   *     to it - the socket delivers everything addressed to this user, not only
   *     the conversation currently on screen.
   *   - The group events (`groupRequestReceived`, `groupRequestRejected`,
   *     `groupFormed`, `leftGroup`, `groupDissolved`, `memberLeft`) change which
   *     conversations should exist, so they reload the list rather than patching
   *     it.
   *
   * Any previous socket is disconnected first, so a re-run of the effect cannot
   * leave two connections delivering duplicate messages.
   */
  const initializeSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    socketRef.current = io(window.location.origin.replace('3000', '3333'), {
      auth: {
        token: authService.getToken()
      }
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected');
      socketRef.current?.emit('join', currentUser.getId());
    });

    socketRef.current.on('message', (newMessage: Message) => {
      console.log('New message received via socket:', newMessage);
      
      // Add message to current conversation if it matches
      setMessages(prevMessages => {
        // Check if this message belongs to the current conversation
        if (selectedConversation) {
          const conversationUserIds = selectedConversation.split('_');
          const currentUserId = currentUser.getId();
          const senderId = newMessage.senderId._id || newMessage.senderId;
          const receiverId = newMessage.receiverId || currentUserId;
          
          // Message belongs to current conversation if sender or receiver is in the conversation
          const messageInCurrentConversation = 
            conversationUserIds.includes(senderId) && conversationUserIds.includes(currentUserId) ||
            conversationUserIds.includes(receiverId) && conversationUserIds.includes(currentUserId);
            
          if (messageInCurrentConversation) {
            return [...prevMessages, newMessage];
          }
        }
        return prevMessages;
      });
    });

    socketRef.current.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Group request socket listeners
    socketRef.current.on('groupRequestReceived', (data: any) => {
      console.log('Group request received:', data);
      // If the profile modal is open for this requester, reload requests
      if (showProfile && showProfile.id === data.requester._id) {
        loadGroupRequestsForConversation(data.requester._id);
      }
      // Show a notification
      alert(`${data.requester.name} sent you a group request!`);
    });

    socketRef.current.on('groupRequestRejected', (data: any) => {
      console.log('Group request rejected:', data);
      // If the profile modal is open, reload requests
      if (showProfile) {
        loadGroupRequestsForConversation(showProfile.id);
      }
      alert(`${data.rejectedBy} rejected your group request.`);
    });

    // Group formation changes the user's status, their swipe deck, their matches
    // and their conversations all at once. Rather than reconciling each, the page
    // is reloaded after a short delay so every view is rebuilt from the server.
    socketRef.current.on('groupFormed', (data: any) => {
      console.log('Group formed:', data);
      alert(`Group "${data.groupName}" has been created successfully!`);
      // Reload conversations as the users are now in a group
      loadConversations();
      setShowProfile(null);
      // Force app refresh by reloading the page after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    });

    socketRef.current.on('leftGroup', (data: any) => {
      console.log('Left group:', data);
      alert(data.message);
      // Reload conversations to show individual conversations again
      loadConversations();
    });

    socketRef.current.on('groupDissolved', (data: any) => {
      console.log('Group dissolved:', data);
      alert(data.message);
      // Reload conversations
      loadConversations();
    });

    socketRef.current.on('memberLeft', (data: any) => {
      console.log('Member left group:', data);
      alert(`${data.leftUserName} has left the group.`);
      // If we're in the group view, we might want to reload
      loadConversations();
    });
  };

  /**
   * Load the user's one-to-one conversations. The server returns an empty array
   * for a user in a group - group membership replaces individual messaging - so
   * an empty result is a legitimate state rather than an error.
   */
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

  /**
   * Load a thread's history. The conversation id encodes the thread type: two
   * user ids joined by an underscore for a direct thread, or a `group_` prefix
   * for a group thread. The server returns the 100 most recent messages,
   * oldest first; there is no pagination, so longer histories are truncated.
   */
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

  /**
   * Send a message in the open conversation.
   *
   * The saved message returned by the server is appended locally rather than
   * waiting for the socket to echo it - the sender's own client is deliberately
   * excluded from the broadcast, so this is what makes the message appear
   * immediately. Empty or whitespace-only input is ignored.
   */
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
        // Add the sent message to the local state immediately for better UX
        setMessages(prevMessages => [...prevMessages, sentMessage]);
      } else {
        console.error('Failed to send message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  /** Enter sends; Shift+Enter inserts a newline, the usual chat convention. */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /**
   * Load the group requests exchanged with one participant, in either direction,
   * so the profile modal can show a request already sent or offer a response to
   * one received.
   */
  const loadGroupRequestsForConversation = async (otherUserId: string) => {
    try {
      const response = await fetch(`/api/group-requests/conversation/${otherUserId}`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGroupRequests(data.requests || []);
      } else {
        console.error('Failed to load group requests');
        setGroupRequests([]);
      }
    } catch (error) {
      console.error('Error loading group requests:', error);
      setGroupRequests([]);
    }
  };

  /**
   * Accept or reject a group request.
   *
   * Accepting is the moment a group comes into existence: the server creates it,
   * merges both users' preferences and moves them to 'in_group'. The parent is
   * notified through `onGroupStatusChange` so the rest of the application picks
   * up the new state, and the conversation list is reloaded because individual
   * conversations are no longer available to either user.
   *
   * @param requestId - the request being answered.
   * @param action    - 'accept' or 'reject'.
   */
  const handleRespondToGroupRequest = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch(`/api/group-requests/${requestId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({ action })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (action === 'accept') {
          alert('Group request accepted! Group created successfully.');
          // The users will now be in a group, so we should refresh the conversations
          loadConversations();
          
          // Notify parent component that group status has changed
          if (onGroupStatusChange) {
            onGroupStatusChange();
          }
        } else {
          alert('Group request rejected.');
        }
        
        // Reload group requests to update the UI
        if (showProfile) {
          loadGroupRequestsForConversation(showProfile.id);
        }
      } else {
        const error = await response.json();
        alert(error.error || `Failed to ${action} group request.`);
      }
    } catch (error) {
      console.error(`Error ${action}ing group request:`, error);
      alert(`Error ${action}ing group request. Please try again.`);
    }
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  /**
   * Open a participant's profile modal, loading their record and, alongside it,
   * any group requests between the two users - the modal's available actions
   * depend on whether a request is already outstanding.
   */
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
        // Load group requests for this conversation
        await loadGroupRequestsForConversation(userId);
      } else {
        console.error('Failed to load user profile');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  /**
   * Invite the person whose profile is open to form a group. The server requires
   * both parties to be individuals, and refuses a duplicate request while one is
   * still pending.
   */
  const handleRequestGroup = async () => {
    if (!showProfile) return;
    
    setRequestLoading(true);
    try {
      const response = await fetch('/api/group-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify({
          recipientId: showProfile.id,
          message: `Hi ${showProfile.name}, would you like to form a group with me for roommate matching?`
        })
      });
      
      if (response.ok) {
        alert('Group request sent successfully!');
        setShowProfile(null);
        // Reload group requests to show the new request
        loadGroupRequestsForConversation(showProfile.id);
      } else {
        const error = await response.json();
        console.error('Failed to send group request:', error);
        alert(error.error || 'Failed to send group request. Please try again.');
      }
    } catch (error) {
      console.error('Error sending group request:', error);
      alert('Error sending group request. Please try again.');
    } finally {
      setRequestLoading(false);
    }
  };

  /**
   * Leave the user's current group, after confirming.
   *
   * The group id is re-read from /api/auth/me rather than taken from local
   * state, so the request always targets the group the server currently believes
   * the user is in. Leaving may dissolve the group entirely if only one member
   * would remain; the server's response says which happened.
   */
  const handleLeaveGroup = async () => {
    if (!showProfile) return;
    
    if (!confirm('Are you sure you want to leave this group? This will restore your individual profile and the group may be dissolved.')) {
      return;
    }
    
    try {
      // Get current user's group ID
      const userResponse = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (!userResponse.ok) {
        throw new Error('Failed to get user info');
      }
      
      const userData = await userResponse.json();
      if (!userData.user.groupId) {
        alert('You are not currently in a group');
        return;
      }

      const response = await fetch(`/api/groups/${userData.user.groupId}/leave`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        setShowProfile(null);
        setSelectedConversation(null);
        // Reload conversations to reflect the change
        loadConversations();
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

  /**
   * Unmatch the person whose profile is open, after confirming.
   *
   * This is irreversible in the sense that the conversation and its history are
   * deleted - but it also deletes both users' swipe records, so the pair can
   * encounter each other again in future decks.
   */
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

  // An empty inbox has two quite different meanings, so they are distinguished
  // here: for a user in a group it is the messaging restriction working as
  // intended, and is explained; for an individual it simply means no matches
  // have been accepted yet.
  if (conversations.length === 0) {
    const isInGroup = currentUserData && currentUserData.status === 'in_group';
    
    if (isInGroup) {
      // Show group restriction message in styled white box
      return (
        <div style={{ 
          padding: '20px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60vh'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '60px 40px',
            backgroundColor: 'white',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            color: '#333',
            maxWidth: '500px'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>💬</div>
            <h3 style={{ 
              color: '#333', 
              marginBottom: '20px', 
              fontSize: '24px',
              fontWeight: '600'
            }}>
              Group Messaging Only
            </h3>
            <p style={{ 
              color: '#666', 
              lineHeight: '1.6',
              fontSize: '16px',
              marginBottom: '0'
            }}>
              You are in a group, messaging others outside of the group is restricted. Leave the group if you would like to explore other roommate options with your individual profile.
            </p>
          </div>
        </div>
      );
    }
    
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
                  messages.map(message => {
                    // Handle system messages differently
                    if (message.messageType === 'system') {
                      return (
                        <div
                          key={message._id}
                          style={{
                            marginBottom: '10px',
                            display: 'flex',
                            justifyContent: 'center'
                          }}
                        >
                          <div
                            style={{
                              padding: '6px 12px',
                              borderRadius: '16px',
                              background: 'rgba(149, 165, 166, 0.3)',
                              color: '#bdc3c7',
                              fontSize: '12px',
                              fontStyle: 'italic'
                            }}
                          >
                            <p style={{ margin: '0' }}>{message.content}</p>
                          </div>
                        </div>
                      );
                    }

                    // Handle regular messages
                    return (
                      <div
                        key={message._id}
                        style={{
                          marginBottom: '10px',
                          display: 'flex',
                          justifyContent: message.senderId?._id === currentUser.getId() ? 'flex-end' : 'flex-start'
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            padding: '8px 12px',
                            borderRadius: '12px',
                            background: message.senderId?._id === currentUser.getId() 
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
                    );
                  })
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

            {/* Group Requests Section */}
            {groupRequests.length > 0 && (
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ color: '#2d3436', marginBottom: '15px' }}>Group Requests</h4>
                <div style={{ 
                  background: '#f8f9fa',
                  padding: '15px',
                  borderRadius: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto'
                }}>
                  {groupRequests.map((request) => {
                    const isCurrentUserRequester = request.requester._id === currentUser.getId();
                    const otherUser = isCurrentUserRequester ? request.recipient : request.requester;
                    
                    return (
                      <div key={request._id} style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: 'white',
                        borderRadius: '6px',
                        border: `2px solid ${
                          request.status === 'pending' ? '#74b9ff' :
                          request.status === 'accepted' ? '#00b894' : '#e17055'
                        }`
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'flex-start',
                          marginBottom: '8px'
                        }}>
                          <div>
                            <strong>
                              {isCurrentUserRequester ? 'You' : otherUser.name} requested to form a group
                            </strong>
                            <div style={{ fontSize: '12px', color: '#636e72', marginTop: '4px' }}>
                              {new Date(request.requestedAt).toLocaleDateString()} at {new Date(request.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            color: 'white',
                            background: 
                              request.status === 'pending' ? '#74b9ff' :
                              request.status === 'accepted' ? '#00b894' : '#e17055'
                          }}>
                            {request.status.toUpperCase()}
                          </span>
                        </div>
                        
                        {request.message && (
                          <div style={{ 
                            fontSize: '14px', 
                            color: '#636e72', 
                            fontStyle: 'italic',
                            marginBottom: '10px' 
                          }}>
                            "{request.message}"
                          </div>
                        )}
                        
                        {/* Show accept/reject buttons only if current user is recipient and request is pending */}
                        {!isCurrentUserRequester && request.status === 'pending' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button
                              onClick={() => handleRespondToGroupRequest(request._id, 'accept')}
                              style={{
                                background: '#00b894',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRespondToGroupRequest(request._id, 'reject')}
                              style={{
                                background: '#e17055',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {/* Show response date if request has been responded to */}
                        {request.respondedAt && (
                          <div style={{ fontSize: '12px', color: '#636e72', marginTop: '8px' }}>
                            Responded on {new Date(request.respondedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
              {(() => {
                const hasPendingRequest = groupRequests.some(req => req.status === 'pending');
                const hasAcceptedRequest = groupRequests.some(req => req.status === 'accepted');
                
                if (hasAcceptedRequest) {
                  // User is in a group, show "Leave Group" button
                  return (
                    <>
                      <div style={{
                        background: '#00b894',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px 24px',
                        fontSize: '16px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        ✓ Group Formed
                      </div>
                      <button
                        onClick={handleLeaveGroup}
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
                        Leave Group
                      </button>
                    </>
                  );
                }
                
                return (
                  <>
                    <button
                      onClick={handleRequestGroup}
                      disabled={hasPendingRequest || requestLoading}
                      style={{
                        background: hasPendingRequest || requestLoading ? '#95a5a6' : '#00b894',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '12px 24px',
                        fontSize: '16px',
                        cursor: hasPendingRequest || requestLoading ? 'not-allowed' : 'pointer',
                        fontWeight: '600',
                        transition: 'background 0.2s ease',
                        opacity: hasPendingRequest || requestLoading ? 0.7 : 1
                      }}
                      onMouseOver={(e) => {
                        if (!hasPendingRequest && !requestLoading) {
                          (e.target as HTMLButtonElement).style.background = '#00a085';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!hasPendingRequest && !requestLoading) {
                          (e.target as HTMLButtonElement).style.background = '#00b894';
                        }
                      }}
                    >
                      {requestLoading ? 'Sending...' : 
                       hasPendingRequest ? 'Request Pending' : 
                       'Request Group'}
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
                  </>
                );
              })()}
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