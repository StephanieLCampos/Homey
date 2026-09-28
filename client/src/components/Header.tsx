/**
 * HEADER COMPONENT
 *
 * The application's persistent top bar and primary navigation: the Homey
 * wordmark, a logout control, and the six view tabs (Discover, Matches, Groups,
 * Search, Messages, Profile).
 *
 * Deliberately stateless - it renders whichever tab `currentView` names as
 * active and reports every click back through `onViewChange`. All navigation
 * state lives in App.tsx, so the header cannot disagree with what is on screen.
 *
 * The unread badge on Messages is suppressed at zero rather than rendered empty.
 *
 * Props:
 *   currentView  - the active view; drives which tab is highlighted.
 *   onViewChange - called with the requested view on a tab click.
 *   unreadCount  - unread messages; the badge is hidden when zero.
 *   onLogout     - optional; the logout button is omitted when not supplied.
 *
 * Connections:
 *   - client/src/App.tsx - the sole consumer, which owns the view state.
 *   - client/src/index.css - the .header, .btn and .logout-btn styles.
 */
import React from 'react';

interface HeaderProps {
  currentView: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile' | 'search';
  onViewChange: (view: 'swipe' | 'matches' | 'groups' | 'messages' | 'profile' | 'search') => void;
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
          className={`btn ${currentView === 'search' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onViewChange('search')}
          style={{ fontSize: '12px', padding: '8px 16px' }}
        >
          Search
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
