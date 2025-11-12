/**
 * HEADER COMPONENT - Navigation bar for the Homey app with tab switching
 * Provides navigation between main app views: swipe, matches, groups, messages, and profile.
 * Displays unread message count badges and highlights currently active tab.
 * Includes logout functionality and responsive design for mobile and desktop.
 * Manages view state changes and coordinates with parent App component for navigation.
 */
import React from 'react';

interface HeaderProps {
  currentView: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile';
  onViewChange: (view: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile') => void;
  unreadCount: number;
  onLogout?: () => void;
}

const Header: React.FC<HeaderProps> = ({ currentView, onViewChange, unreadCount, onLogout }) => {
  return (
    <div className="header">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <h1>HOMEY</h1>
          <p>Find your perfect living situation</p>
        </div>
        {onLogout && (
          <button 
            onClick={onLogout}
            className="logout-btn"
          >
            Logout
          </button>
        )}
      </div>
      
      <nav style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
        <button
          className={`btn ${currentView === 'swipe' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('swipe')}
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          Discover
        </button>
        <button
          className={`btn ${currentView === 'matches' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('matches')}
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          Matches
        </button>
        <button
          className={`btn ${currentView === 'groups' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('groups')}
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          Groups
        </button>
        <button
          className={`btn ${currentView === 'messages' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('messages')}
          style={{ fontSize: '12px', padding: '8px 16px', position: 'relative' }}
        >
          Messages
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              background: '#e74c3c',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {unreadCount}
            </span>
          )}
        </button>
        <button
          className={`btn ${currentView === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('profile')}
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          Profile
        </button>
      </nav>
    </div>
  );
};

export default Header;
