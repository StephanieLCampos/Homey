/**
 * SWIPE CARD COMPONENT
 *
 * A single draggable card in the discovery deck, showing a photo, name, bio and
 * preference tags, with pass and like buttons beneath.
 *
 * Gesture handling is implemented directly rather than with a library. Pointer
 * and touch events are handled in parallel so the card behaves the same on
 * desktop and mobile: the press records an origin, movement stores the offset,
 * and release either commits a swipe or springs the card back. A horizontal
 * displacement of more than 100px counts as a decision - right for 'like', left
 * for 'pass'. During a drag the CSS transition is disabled so the card tracks
 * the pointer exactly, and restored on release so the spring-back animates.
 * Rotation and opacity are derived from the horizontal offset, which is what
 * gives the card its tilt and fade as it leaves the screen.
 *
 * The deck contains both people and groups. A group card arrives from the API
 * with `isGroup: true` and an id prefixed `group_`; the component branches on
 * that flag to show a member count instead of an age, to shorten the bio, and to
 * offer an info button that fetches the group's full profile into a modal.
 * Because the incoming object is not a real `User` instance, those extra fields
 * are reached through `as any` casts - the deck is heterogeneous while the prop
 * type is not.
 *
 * Props:
 *   user    - the person or group to display.
 *   onSwipe - called with (userId, 'like' | 'pass') once a decision is made.
 *   style   - positioning supplied by the parent for card stacking.
 *
 * Connections:
 *   - client/src/App.tsx        - owns the deck and handles onSwipe.
 *   - client/src/classes/User.ts - the prop type.
 *   - client/src/services/authService.ts - token for the group preview fetch.
 *   - server/index.js - GET /api/groups/:groupId/preview, and the
 *                       potential-matches endpoint that supplies these cards.
 *
 * Note: this component emits 'pass', while the server's swipe endpoint expects
 * 'dislike'; App.tsx translates between the two.
 */
import React, { useState, useRef } from 'react';
import { User } from '../classes/User';
import defaultUserImage from '../images/default_user.png';
import { authService } from '../services/authService';

interface SwipeCardProps {
  user: User;
  onSwipe: (userId: string, action: 'like' | 'pass') => void;
  style?: React.CSSProperties;
}

const SwipeCard: React.FC<SwipeCardProps> = ({ user, onSwipe, style }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupData, setGroupData] = useState<any>(null);
  const [loadingGroupInfo, setLoadingGroupInfo] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // --- Pointer gesture handling -------------------------------------------
  // Records the drag origin and disables the CSS transition so the card follows
  // the pointer one-to-one rather than easing behind it.
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startPos.x;
    const deltaY = e.clientY - startPos.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  /**
   * End of a pointer drag. Past 100px of horizontal travel the gesture counts as
   * a decision - right is a like, left a pass - otherwise the offset is cleared
   * and the restored transition springs the card back to centre.
   *
   * Also bound to onMouseLeave, so dragging off the card ends the gesture
   * cleanly instead of leaving it stuck to the pointer.
   */
  const handleMouseUp = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 0.3s ease';
    }

    const threshold = 100;
    if (Math.abs(dragOffset.x) > threshold) {
      const action = dragOffset.x > 0 ? 'like' : 'pass';
      onSwipe(user.getId(), action);
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // --- Touch gesture handling ---------------------------------------------
  // The same three-phase logic against the first touch point. Touch and pointer
  // events are handled separately because a browser does not reliably deliver
  // both for one physical gesture.
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setStartPos({ x: touch.clientX, y: touch.clientY });
    if (cardRef.current) {
      cardRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - startPos.x;
    const deltaY = touch.clientY - startPos.y;
    setDragOffset({ x: deltaX, y: deltaY });
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform 0.3s ease';
    }

    const threshold = 100;
    if (Math.abs(dragOffset.x) > threshold) {
      const action = dragOffset.x > 0 ? 'like' : 'pass';
      onSwipe(user.getId(), action);
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  const handleLike = () => {
    onSwipe(user.getId(), 'like');
  };

  const handlePass = () => {
    onSwipe(user.getId(), 'pass');
  };

  /**
   * Load and show a group's full profile in a modal.
   *
   * Only meaningful for group cards. The real group id is taken from the
   * `groupId` field where present, falling back to stripping the `group_` prefix
   * the potential-matches endpoint applies to the card id.
   */
  const handleGroupInfo = async () => {
    if (!(user as any).isGroup) return;
    
    setLoadingGroupInfo(true);
    try {
      // Extract the actual group ID from the user ID
      const groupId = (user as any).groupId || user.getId().replace('group_', '');
      
      const response = await fetch(`/api/groups/${groupId}/preview`, {
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGroupData(data);
        setShowGroupInfo(true);
      } else {
        console.error('Failed to load group data:', response.status);
        alert('Failed to load group information');
      }
    } catch (error) {
      console.error('Error loading group data:', error);
      alert('Error loading group information');
    } finally {
      setLoadingGroupInfo(false);
    }
  };

  // Visual feedback derived from the drag: the card tilts in proportion to
  // horizontal travel and fades as it approaches the edge, floored at 0.3 so it
  // stays visible right up to the moment it is released.
  const rotation = dragOffset.x * 0.1;
  const opacity = Math.max(0.3, 1 - Math.abs(dragOffset.x) / 300);

  return (
    <div className="swipe-card-container" style={style}>
      <div
        ref={cardRef}
        className={`swipe-card ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) rotate(${rotation}deg)`,
          opacity
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="card">
          <img
            src={user.getPhotos()[0] || defaultUserImage}
            alt={user.getName()}
            className="profile-image"
          />
          <div className={`profile-info ${(user as any).isGroup ? 'group-profile' : ''}`}>
            <div className="profile-header">
              <span className={`profile-name ${(user as any).isGroup ? 'group-name' : ''}`}>
                {user.getName()}
              </span>
              {!(user as any).isGroup && (
                <span className="profile-age">{user.getAge()}</span>
              )}
            </div>
            
            {/* Show group counts when this card represents a group */}
            {(user as any).isGroup && (
              <div style={{ 
                margin: '4px 0 8px 0', 
                color: '#666', 
                fontSize: '14px',
                fontWeight: '500'
              }}>
                {(user as any).memberCount ?? 0} / {(user as any).maxMembers ?? 8} members
              </div>
            )}
            
            {user.getBio() && !(user as any).isGroup && (
              <p className="profile-bio">{user.getBio()}</p>
            )}
            
            {/* Compact bio for groups */}
            {user.getBio() && (user as any).isGroup && (
              <p style={{
                color: '#495057',
                fontSize: '13px',
                lineHeight: '1.4',
                margin: '4px 0 8px 0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as any,
                maxHeight: '36px'
              }}>
                {user.getBio()}
              </p>
            )}
            
            <div className={`preferences ${(user as any).isGroup ? 'group-preferences' : 'user-preferences'}`}>
              <span className="preference-tag">
                ${user.getPreferences().maxRent}/mo
              </span>
              <span className="preference-tag">
                Clean: {user.getPreferences().cleanlinessLevel}/5
              </span>
              <span className="preference-tag">
                Noise: {user.getPreferences().noiseTolerance}/5
              </span>
              {user.getPreferences().petFriendly && (
                <span className="preference-tag">Pet OK</span>
              )}
              {user.getPreferences().smokingAllowed && (
                <span className="preference-tag">Smoke OK</span>
              )}
              {user.getPreferences().location?.city && (
                <span className="preference-tag">
                  {user.getPreferences().location.city}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="action-buttons">
        <button
          className="action-btn pass-btn"
          onClick={handlePass}
          style={{ marginRight: '10px' }}
        >
          ✕
        </button>
        
        {/* Show Info button for group cards */}
        {(user as any).isGroup && (
          <button
            className="action-btn info-btn"
            onClick={handleGroupInfo}
            disabled={loadingGroupInfo}
            style={{ 
              marginRight: '10px',
              backgroundColor: '#74b9ff',
              color: 'white',
              fontSize: '16px'
            }}
          >
            {loadingGroupInfo ? '...' : 'ℹ'}
          </button>
        )}
        
        <button
          className="action-btn like-btn"
          onClick={handleLike}
        >
          ♥
        </button>
      </div>

      {/* Group Info Modal */}
      {showGroupInfo && groupData && (
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
          zIndex: 2000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '15px',
            padding: '25px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            color: 'black'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#2d3436' }}>Group Information</h3>
              <button 
                onClick={() => setShowGroupInfo(false)}
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
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#2d3436' }}>{groupData.name}</h4>
              {groupData.description && (
                <p style={{ color: '#636e72', margin: '0 0 8px 0', fontSize: '14px', fontStyle: 'italic' }}>
                  "{groupData.description}"
                </p>
              )}
              <p style={{ color: '#636e72', margin: '0', fontSize: '12px' }}>
                {groupData.memberIds?.length || 0} / {groupData.maxMembers || 8} members
              </p>
            </div>

            {/* Members with detailed layout matching group invitation */}
            {groupData.memberIds && groupData.memberIds.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h5 style={{ color: '#2d3436', marginBottom: '12px', fontSize: '14px' }}>Members:</h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {groupData.memberIds.filter((member: any) => member && member._id).map((member: any, index: number) => {
                    // Scale each member tile down as the group grows, so that up
                    // to eight members still fit the modal without scrolling.
                    // The same size ladder is used by the group invitation card
                    // in MatchesList.tsx, keeping the two views consistent.
                    // Members are filtered first because a deleted account
                    // populates as null.
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
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Group Preferences */}
            {groupData.preferences && (
              <div style={{ marginBottom: '15px' }}>
                <h5 style={{ color: '#2d3436', marginBottom: '8px', fontSize: '14px' }}>Group Preferences:</h5>
                <div style={{ fontSize: '12px', color: '#636e72', lineHeight: '1.4' }}>
                  <div>Max Rent: ${groupData.preferences.maxRent || 'Not specified'}</div>
                  <div>Age Range: {groupData.preferences.minAge || '—'} - {groupData.preferences.maxAge || '—'}</div>
                  <div>Cleanliness Level: {groupData.preferences.cleanlinessLevel || '—'}/5</div>
                  <div>Noise Tolerance: {groupData.preferences.noiseTolerance || '—'}/5</div>
                  <div>Pet Friendly: {groupData.preferences.petFriendly ? 'Yes' : 'No'}</div>
                  <div>Smoking Allowed: {groupData.preferences.smokingAllowed ? 'Yes' : 'No'}</div>
                  {groupData.preferences.location?.city && (
                    <div>Location: {groupData.preferences.location.city}, {groupData.preferences.location.state}</div>
                  )}
                </div>
              </div>
            )}

            {/* Close Button */}
            <div style={{ textAlign: 'center', marginTop: '15px' }}>
              <button
                onClick={() => setShowGroupInfo(false)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#74b9ff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
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

export default SwipeCard;
