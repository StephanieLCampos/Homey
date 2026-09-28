/**
 * GROUP MANAGEMENT COMPONENT
 *
 * The Groups view, and the whole of a user's group experience in one place: the
 * shared chat thread, the member list, the group profile and its editor, the
 * queue of inbound join requests, and the option to leave.
 *
 * A user belongs to at most one group, so this component loads a single group
 * conversation rather than a list, and renders an empty state when the user has
 * none.
 *
 * Live updates arrive over Socket.io, and the event set differs from the
 * individual messaging view: alongside 'message' it listens for
 * `groupJoinRequest`, `joinRequestAccepted`, `joinRequestRejected`, `memberLeft`
 * and `groupDissolved` - the events that change who is in the group. Socket
 * set-up is deliberately fault-tolerant: a failure to connect is logged and the
 * component continues over REST alone, on the principle that losing live updates
 * should not cost the user their group chat.
 *
 * Group editing is collaborative - any member may rename the group, change its
 * description, photo, preferences or capacity - with no owner or admin role.
 * Join requests are likewise answerable by any member.
 *
 * Props:
 *   currentUser        - the signed-in user.
 *   onUserStatusChange - notifies App.tsx when the user has left the group, so
 *                        the rest of the application can return to its
 *                        individual state.
 *
 * Connections:
 *   - client/src/services/authService.ts - token for REST calls and the handshake.
 *   - client/src/App.tsx - the parent.
 *   - server/index.js - /api/group-conversations, /api/messages/group/:groupId,
 *                       /api/groups/:groupId (GET and PUT),
 *                       /api/groups/:groupId/join-requests,
 *                       /api/groups/:groupId/leave, and the Socket.io server.
 *   - server/models/Group.js - the schema behind the profile edited here.
 *
 * Notes:
 *   - As in MessagingInterface, the socket URL is derived by substituting 3000
 *     for 3333 in the page origin, which ties it to the local development ports.
 *   - The group photo is stored as a base64 data URL on the group document, the
 *     same approach as user photos.
 *   - Responding to a join request is rendered in the request list further down;
 *     it posts to /api/groups/:groupId/join-request/:requestId/respond.
 */
import React, { useState, useEffect, useRef } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';
import { io, Socket } from 'socket.io-client';

interface GroupManagementProps {
  currentUser: User;
  onUserStatusChange?: () => void;
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
  maxMembers?: number;
}

interface Message {
  _id: string;
  senderId: any;
  groupId?: string;
  content: string;
  createdAt: string;
}

const GroupManagement: React.FC<GroupManagementProps> = ({ currentUser, onUserStatusChange }) => {
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

  // Load the group conversation, then attach the socket. The `mounted` flag
  // guards against the asynchronous load completing after unmount and writing to
  // state; the cleanup removes every listener before disconnecting so no handler
  // survives into the next mount.
  useEffect(() => {
    console.log('GroupManagement useEffect triggered for user:', currentUser.getId());
    let mounted = true;
    
    const initializeComponent = async () => {
      if (mounted) {
        await loadGroupConversation();
        
        // Try to initialize socket, but don't block if it fails
        try {
          if (mounted) {
            initializeSocket();
          }
        } catch (error) {
          console.log('Failed to initialize socket, continuing without real-time features');
        }
      }
    };
    
    initializeComponent();
    
    return () => {
      mounted = false;
      if (socketRef.current) {
        try {
          socketRef.current.removeAllListeners();
          socketRef.current.disconnect();
          socketRef.current = null;
        } catch (error) {
          console.log('Error disconnecting socket:', error);
        }
      }
    };
  }, [currentUser.getId()]); // Depend on user ID to force reload when user changes

  /**
   * Open the authenticated socket and register the group event handlers.
   *
   * Failure is tolerated throughout: a missing token skips the connection
   * entirely, an authentication error disconnects without retrying, and nothing
   * is surfaced to the user - the component remains fully usable over REST, just
   * without live updates.
   *
   * Two details are deliberate. The connection is created inside a short timeout
   * with a re-check of the ref, which avoids a race in React's strict-mode double
   * invocation that could otherwise open two sockets. And the 'message' handler
   * ignores messages from the current user, because the sender's own message is
   * already appended locally when the send request returns - without that guard
   * it would appear twice.
   *
   * Transports are set to polling first, then websocket, so a connection is
   * established even where a websocket upgrade is blocked.
   */
  const initializeSocket = () => {
    // Clean up existing socket first
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      const token = authService.getToken();
      if (!token) {
        console.log('No auth token available, skipping socket connection');
        return;
      }

      // Add a small delay to prevent race conditions
      setTimeout(() => {
        if (!socketRef.current) {  // Double-check socket hasn't been created
          socketRef.current = io(window.location.origin.replace('3000', '3333'), {
            auth: {
              token: token
            },
            transports: ['polling', 'websocket'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 3,
            reconnectionDelay: 2000,
            closeOnBeforeunload: false
          });

          // Add event handlers only after socket is created
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
            // Handle null senderId for system messages or messages from users who left
            if (groupConversation && 
                newMessage.groupId === groupConversation.groupId &&
                (!newMessage.senderId || newMessage.senderId._id !== currentUser.getId())) {
              setMessages(prevMessages => [...prevMessages, newMessage]);
            }
          });

          // Listen for join requests sent to the group and refresh the list when received
          // A join request is broadcast to every member. The incoming group id is
          // normalised to a string first, because it may arrive as an ObjectId or
          // as a populated object depending on the emitting endpoint, and it is
          // then matched against whichever group this view currently has loaded.
          socketRef.current.on('groupJoinRequest', (data: any) => {
            try {
              console.log('Received groupJoinRequest socket event:', data);

              // Normalize incoming groupId to string (handle ObjectId vs string)
              const incomingGroupId = String(data.groupId?._id || data.groupId);
              const convGroupId = String((groupConversation && groupConversation.groupId) ? groupConversation.groupId : '');
              const groupDataId = String(groupData?._id || '');

              // If we're viewing the same group conversation, reload join requests
              if (groupConversation && incomingGroupId && incomingGroupId === convGroupId) {
                loadJoinRequests(incomingGroupId);
              } else if (groupDataId && incomingGroupId === groupDataId) {
                // If we have groupData loaded (e.g., viewing profile), reload
                loadJoinRequests(incomingGroupId);
              } else {
                // Fall back: if groupConversation or groupData are not set, do nothing
                console.log('groupJoinRequest not for the active group view; incomingGroupId=', incomingGroupId);
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

          // Listen for join request acceptance (emitted to all group members)
          socketRef.current.on('joinRequestAccepted', (data: any) => {
      console.log('Join request accepted:', data);
      // Reload to update member list and remove accepted request
      if (groupConversation && data.groupId === groupConversation.groupId) {
        loadGroupConversation();
        loadJoinRequests(groupConversation.groupId);
      }
          });

          // Listen for join request rejection
          socketRef.current.on('joinRequestRejected', (data: any) => {
      console.log('Join request rejected:', data);
      // Reload join requests to update the UI
      if (groupConversation && data.groupId === groupConversation.groupId) {
        loadJoinRequests(groupConversation.groupId);
      }
          });

          socketRef.current.on('groupDissolved', (data: any) => {
            console.log('Group dissolved:', data);
            alert(data.message);
            setGroupConversation(null);
            setMessages([]);
          });
        }
      }, 100);
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
          preferences: data.preferences || {},
          maxMembers: data.maxMembers || 4,
          photo: (data.photos && data.photos.length > 0) ? data.photos[0] : null
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

  // Handle uploading a single photo for the group profile (client-side base64 conversion)
  /**
   * Read a chosen image into a base64 data URL and stage it on the edit form.
   * Nothing is sent until the profile is saved.
   */
  const handleGroupPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setEditData((prev: any) => ({
        ...prev,
        photo: base64
      }));
    };
    reader.onerror = (err) => {
      console.error('Failed to read file', err);
      alert('Failed to read image file. Please try a different image.');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveGroupPhoto = () => {
    setEditData((prev: any) => ({ ...prev, photo: null }));
  };

  /**
   * Load the group's inbound join requests. Restricted server-side to members,
   * and any member may accept or reject.
   */
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

  /**
   * Load the user's group conversation.
   *
   * The endpoint returns an array for symmetry with the individual conversations
   * endpoint, but a user belongs to at most one group, so only the first element
   * is used and an empty array means the user has no group. Messages and pending
   * join requests are loaded alongside it, so the view is complete in one pass.
   */
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

  /**
   * Send a message to the group.
   *
   * The input is cleared optimistically so the field is immediately ready for
   * the next message, and restored verbatim if the request fails - the user does
   * not lose what they typed. The saved message is appended locally because the
   * server excludes the sender from its broadcast.
   */
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

  /**
   * Write one staged edit. A key prefixed 'preferences.' is routed into the
   * nested preferences object; anything else is a top-level group field.
   */
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

  /**
   * Save the group profile.
   *
   * Any member may do this - the group has no owner. The single staged photo is
   * sent as a one-element array (or an empty array to clear it), matching the
   * `photos` array on the schema. The conversation is reloaded afterwards so a
   * renamed group is reflected in the header.
   *
   * Note that lowering `maxMembers` below the current member count will mark the
   * group full and pause it, which the server handles on save.
   */
  const handleSaveGroupProfile = async () => {
    if (!groupConversation || !editData) return;

    try {
      // Build payload: send photos as an array with single photo (or empty array)
      const payload = {
        name: editData.name,
        description: editData.description,
        preferences: editData.preferences,
        maxMembers: editData.maxMembers,
        photos: editData.photo ? [editData.photo] : []
      };

      const response = await fetch(`/api/groups/${groupConversation.groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authService.getToken()}`
        },
        body: JSON.stringify(payload)
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

  /**
   * Open the editor with freshly-fetched group data, rather than whatever was
   * last rendered - another member may have changed the profile since.
   */
  const handleOpenEditProfile = async () => {
    if (groupConversation) {
      await loadGroupData(groupConversation.groupId);
      setShowGroupProfile(false);
      setShowEditProfile(true);
    }
  };

  /**
   * Leave the group, after confirming.
   *
   * The server restores the user to an individual with an active profile and, if
   * only one member would remain, dissolves the group and releases that member
   * too. `onUserStatusChange` tells App.tsx to reload, since the user's swipe
   * deck, matches and conversations all revert to their individual form.
   */
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
        
        // Notify parent component that user status changed
        if (onUserStatusChange) {
          onUserStatusChange();
        }
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
          alignItems: 'center',
          gap: '15px'
        }}>
          <div style={{
            flex: '1',
            minWidth: '0', // Allow text to wrap/truncate
            overflow: 'hidden'
          }}>
            <h3 style={{ color: 'white', margin: '0 0 4px 0', fontSize: '18px' }}>
              {groupConversation.groupName}
            </h3>
            <div style={{ 
              color: '#ddd', 
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              Members: {groupConversation.members.filter(m => m && m.name).map(m => m.name).join(', ')}
            </div>
              <div style={{ color: '#ddd', fontSize: '12px', marginTop: '4px' }}>
                { /* Show current/target members: use loaded groupData if available for maxMembers */ }
                Current: {groupConversation.members.filter(m => m && m.id).length} / Target: {groupConversation.maxMembers ?? 8}
              </div>
          </div>
          <button
                  onClick={async () => {
                    // Load full group data before showing profile so we can display maxMembers
                    try {
                      await loadGroupData(groupConversation.groupId);
                    } catch (err) {
                      console.error('Failed to load group data for profile view', err);
                    }
                    setShowGroupProfile(true);
                  }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'white',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '12px',
              flexShrink: 0,
              whiteSpace: 'nowrap'
            }}
          >
            Info
          </button>
        </div>

        {/* Pending Join Requests (visible to group members) */}
        {joinRequests.filter(req => req.status === 'pending').length > 0 && (
          <div style={{ margin: '10px 0 18px 0', padding: '12px', background: 'rgba(0,0,0,0.12)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#fff' }}>Pending Join Requests</h4>
            {joinRequests.filter(req => req.status === 'pending').map(req => (
              <div key={req._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <div style={{ color: '#ddd' }}>
                  <strong style={{ color: '#fff' }}>{req.requester?.name || 'User'}</strong>
                  <div style={{ fontSize: '13px', color: '#ccc' }}>{req.message || ''}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={async () => {
                      try {
                        // Use groupData._id when available, otherwise fall back to the active conversation's groupId
                        const gid = (groupData && groupData._id) ? groupData._id : (groupConversation ? groupConversation.groupId : null);
                        if (!gid) {
                          console.error('No group id available to accept join request');
                          alert('Unable to accept request: no group selected');
                          return;
                        }

                        const r = await fetch(`/api/groups/${gid}/join-request/${req._id}/respond`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
                          body: JSON.stringify({ action: 'accept' })
                        });
                        if (r.ok) {
                          // Immediately remove the request from the UI
                          setJoinRequests(prev => prev.filter(request => request._id !== req._id));
                          // Then reload to ensure consistency
                          await loadJoinRequests(gid);
                          await loadGroupConversation();
                          // Alert other group members about the new member
                          if (socketRef.current) {
                            socketRef.current.emit('notifyGroupMembers', { 
                              groupId: gid, 
                              event: 'joinRequestAccepted',
                              data: { groupId: gid }
                            });
                          }
                        } else {
                          console.error('Failed to accept join request', await r.text());
                          alert('Failed to accept request');
                        }
                      } catch (err) {
                        console.error('Accept join request error', err);
                        alert('Error accepting request');
                      }
                    }}
                    disabled={req.status !== 'pending'}
                    style={{ background: req.status === 'pending' ? '#2ecc71' : '#9adfa9', border: 'none', padding: '6px 10px', borderRadius: '6px', color: 'white', cursor: req.status === 'pending' ? 'pointer' : 'not-allowed' }}
                  >
                    {req.status === 'pending' ? 'Accept' : req.status === 'accepted' ? 'Accepted' : 'Rejected'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const gid = (groupData && groupData._id) ? groupData._id : (groupConversation ? groupConversation.groupId : null);
                        if (!gid) {
                          console.error('No group id available to reject join request');
                          alert('Unable to reject request: no group selected');
                          return;
                        }

                        const r = await fetch(`/api/groups/${gid}/join-request/${req._id}/respond`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authService.getToken()}` },
                          body: JSON.stringify({ action: 'reject' })
                        });
                        if (r.ok) {
                          await loadJoinRequests(gid);
                        } else {
                          console.error('Failed to reject join request', await r.text());
                          alert('Failed to reject request');
                        }
                      } catch (err) {
                        console.error('Reject join request error', err);
                        alert('Error rejecting request');
                      }
                    }}
                    disabled={req.status !== 'pending'}
                    style={{ background: req.status === 'pending' ? '#e74c3c' : '#f5a6a6', border: 'none', padding: '6px 10px', borderRadius: '6px', color: 'white', cursor: req.status === 'pending' ? 'pointer' : 'not-allowed' }}
                  >
                    {req.status === 'pending' ? 'Reject' : req.status === 'accepted' ? 'Accepted' : 'Rejected'}
                  </button>
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
            messages.map(message => {
              // Handle messages from users who have left the group (senderId might be null)
              const isCurrentUser = message.senderId && message.senderId._id === currentUser.getId();
              const isSystemMessage = !message.senderId;
              const senderName = message.senderId?.name || 'Former Member';
              
              // Render system messages as centered notifications
              if (isSystemMessage) {
                return (
                  <div
                    key={message._id}
                    style={{
                      marginBottom: '10px',
                      display: 'flex',
                      justifyContent: 'center',
                      width: '100%'
                    }}
                  >
                    <div style={{
                      backgroundColor: 'rgba(108, 117, 125, 0.2)',
                      color: '#6c757d',
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      textAlign: 'center',
                      fontStyle: 'italic',
                      border: '1px solid rgba(108, 117, 125, 0.3)',
                      maxWidth: '80%'
                    }}>
                      {message.content}
                    </div>
                  </div>
                );
              }
              
              // Render regular user messages
              return (
                <div
                  key={message._id}
                  style={{
                    marginBottom: '10px',
                    display: 'flex',
                    justifyContent: isCurrentUser ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div style={{
                    maxWidth: '70%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isCurrentUser ? 'flex-end' : 'flex-start'
                  }}>
                    {!isCurrentUser && (
                      <div style={{
                        fontSize: '10px',
                        color: '#ddd',
                        marginBottom: '4px',
                        paddingLeft: '8px'
                      }}>
                        {senderName}
                      </div>
                    )}
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: '12px',
                        background: isCurrentUser ? '#007bff' : '#6c757d',
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
            
            {/* Group Name & Description */}
            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#2d3436' }}>{groupData?.name || groupConversation.groupName}</h3>
              {groupData?.description && (
                <p style={{ color: '#636e72', margin: '0 0 8px 0', fontSize: '14px', fontStyle: 'italic' }}>
                  "{groupData.description}"
                </p>
              )}
              <p style={{ color: '#636e72', margin: '0', fontSize: '12px' }}>
                Created: {new Date(groupConversation.updatedAt).toLocaleDateString()}
              </p>
            </div>

            {/* Members */}
            <div style={{ marginBottom: '25px' }}>
              <h4 style={{ color: '#2d3436', marginBottom: '15px' }}>
                Members ({groupData?.memberIds?.filter((m: any) => m && m._id).length || groupConversation.members.filter(m => m && m.id).length}/{groupData?.maxMembers || groupConversation.maxMembers || 8})
              </h4>
              
              {/* Use detailed member data from groupData if available, otherwise fallback to basic groupConversation data */}
              {groupData && groupData.memberIds && groupData.memberIds.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {groupData.memberIds.filter((member: any) => member && member._id).map((member: any, index: number) => {
                    // Calculate responsive sizing based on group size (matching group invitation layout)
                    const validMembers = groupData.memberIds.filter((m: any) => m && m._id);
                    const memberCount = validMembers.length;
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
                          background: member._id === currentUser.getId() ? 'rgba(0, 184, 148, 0.1)' : 'rgba(108, 92, 231, 0.1)',
                          padding: padding, 
                          borderRadius: '12px',
                          border: member._id === currentUser.getId() ? '1px solid rgba(0, 184, 148, 0.3)' : '1px solid rgba(108, 92, 231, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          maxWidth: maxWidth,
                          position: 'relative'
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
                            fontWeight: '600',
                            fontSize: fontSize,
                            color: '#2d3436',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {member.name}
                          </span>
                          <span style={{
                            fontSize: `${parseInt(fontSize) - 1}px`,
                            color: '#636e72',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {member.age && member.gender ? `${member.age}, ${member.gender}` : (member.age || member.gender || '')}
                          </span>
                          {member.preferences?.location?.city && (
                            <span style={{
                              fontSize: `${parseInt(fontSize) - 1}px`,
                              color: '#636e72',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {member.preferences.location.city}
                            </span>
                          )}
                        </div>
                        
                        {/* "You" indicator */}
                        {member._id === currentUser.getId() && (
                          <span style={{ 
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            fontSize: '10px',
                            color: '#00b894',
                            fontWeight: '600',
                            background: 'white',
                            padding: '2px 6px',
                            borderRadius: '10px',
                            border: '1px solid #00b894'
                          }}>
                            You
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Fallback to basic member display if groupData is not loaded
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {groupConversation.members.filter(member => member && member.id).map(member => (
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
              )}
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

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#2d3436', fontWeight: '600' }}>
                  Target Group Size (max members):
                </label>
                <select
                  value={editData.maxMembers || 4}
                  onChange={(e) => handleEditChange('maxMembers', parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    background: 'white'
                  }}
                >
                  {[2,3,4,5,6,7,8].map(n => (
                    <option key={n} value={n}>{n} {n === 1 ? 'member' : 'members'}</option>
                  ))}
                </select>
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

            {/* Photos */}
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ color: '#2d3436', marginBottom: '15px' }}>Photos</h3>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {editData.photo ? (
                  <div style={{ position: 'relative' }}>
                    <img src={editData.photo} alt="group-photo" style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #ddd' }} />
                    <button
                      onClick={handleRemoveGroupPhoto}
                      style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#e74c3c', border: 'none', color: 'white', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label style={{ width: '120px', height: '120px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc', borderRadius: '8px', cursor: 'pointer', color: '#636e72' }}>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGroupPhotoUpload} />
                    +
                  </label>
                )}
              </div>
            </div>

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