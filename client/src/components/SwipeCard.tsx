/**
 * SWIPE CARD COMPONENT - Interactive user profile card for the discovery/swipe interface
 * Displays user photos, bio, age, gender, and detailed roommate preferences in card format.
 * Handles touch/mouse interactions for swiping left (pass) or right (like) on potential matches.
 * Includes expandable sections for viewing full user details and preference compatibility.
 * Provides smooth animations and gesture recognition for intuitive user experience.
 */
import React, { useState, useRef } from 'react';
import { User } from '../classes/User';
import defaultUserImage from '../images/default_user.png';

interface SwipeCardProps {
  user: User;
  onSwipe: (userId: string, action: 'like' | 'pass') => void;
  style?: React.CSSProperties;
}

const SwipeCard: React.FC<SwipeCardProps> = ({ user, onSwipe, style }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

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
          <div className="profile-info">
            <div className="profile-header">
              <span className="profile-name">{user.getName()}</span>
              <span className="profile-age">{user.getAge()}</span>
            </div>
            {user.getBio() && (
              <p className="profile-bio">{user.getBio()}</p>
            )}
            
            <div className="preferences">
              <span className="preference-tag">
                Max Rent: ${user.getPreferences().maxRent}
              </span>
              <span className="preference-tag">
                Cleanliness: {user.getPreferences().cleanlinessLevel}/5
              </span>
              <span className="preference-tag">
                Noise Tolerance: {user.getPreferences().noiseTolerance}/5
              </span>
              {user.getPreferences().petFriendly && (
                <span className="preference-tag">Pet Friendly</span>
              )}
              {user.getPreferences().smokingAllowed && (
                <span className="preference-tag">Smoking OK</span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="action-buttons">
        <button
          className="action-btn pass-btn"
          onClick={handlePass}
          style={{ marginRight: '20px' }}
        >
          ✕
        </button>
        <button
          className="action-btn like-btn"
          onClick={handleLike}
        >
          ♥
        </button>
      </div>
    </div>
  );
};

export default SwipeCard;
