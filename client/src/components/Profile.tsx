/**
 * PROFILE COMPONENT
 *
 * The signed-in user's own profile: a single view that toggles between read-only
 * display and an inline editor via the `isEditing` flag, so the same field
 * layout serves both modes.
 *
 * Edits are staged in `editData`, initialised from the current user and
 * discarded on cancel, so nothing is written until Save. On save the component
 * does not trust its own staged values: it sends them to the API and rebuilds a
 * `User` from the server's response before calling `onProfileUpdate`. The server
 * is therefore the source of truth for what the profile now contains.
 *
 * Photo changes are applied immediately rather than staged, since a picture
 * cannot be usefully previewed as pending. The file is read into a base64 data
 * URL and saved on its own - the same inline-image approach used at registration.
 *
 * The account-deactivation section at the foot calls the server directly rather
 * than going through authService, because the implemented route is
 * /api/user/:id/deactivate. It confirms first, then logs out and reloads, since
 * every piece of loaded state belongs to an account that no longer participates.
 *
 * Props:
 *   currentUser     - the profile to display and edit.
 *   onProfileUpdate - called with a rebuilt User after a successful save.
 *
 * Connections:
 *   - client/src/services/authService.ts - PUT /api/auth/me and the token.
 *   - client/src/classes/User.ts - the type constructed from API responses.
 *   - client/src/App.tsx - owns the user and handles onProfileUpdate.
 *   - server/routes/auth.js, server/index.js - the endpoints called.
 *
 * Note: email, gender and location are shown but not editable here; changing
 * them is not offered anywhere in the UI, though the API would accept gender and
 * location changes.
 */
import React, { useState, useRef } from 'react';
import { User } from '../classes/User';
import { authService } from '../services/authService';
import defaultUserImage from '../images/default_user.png';

interface ProfileProps {
  currentUser: User;
  onProfileUpdate: (updatedUser: User) => void;
}

export const Profile: React.FC<ProfileProps> = ({ currentUser, onProfileUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [editData, setEditData] = useState({
    name: currentUser.getName(),
    age: currentUser.getAge(),
    bio: currentUser.getBio(),
    preferences: { ...currentUser.getPreferences() }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  /**
   * Replace the profile picture.
   *
   * The chosen file is read into a base64 data URL, put at the head of the photo
   * array (preserving any others), and saved immediately rather than waiting for
   * the Save button - a photo has no meaningful pending state.
   *
   * The User rebuilt from the response is what propagates to the parent, so the
   * displayed picture is the one the server actually stored.
   */
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Convert file to base64 for demo purposes
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageDataUrl = e.target?.result as string;
        // Update user photos with new image
        const updatedPhotos = [imageDataUrl, ...currentUser.getPhotos().slice(1)];
        
        try {
          // Save to database
          const updateData = {
            photos: updatedPhotos
          };
          const updatedUserData = await authService.updateProfile(updateData);
          
          // Create updated user object with server response
          const updatedUser = new User(
            updatedUserData.id,
            updatedUserData.email,
            updatedUserData.name,
            updatedUserData.age,
            updatedUserData.gender as 'male' | 'female' | 'non-binary' | 'other',
            updatedUserData.bio,
            updatedUserData.photos,
            updatedUserData.preferences
          );
          
          onProfileUpdate(updatedUser);
          setIsUploading(false);
        } catch (error) {
          console.error('Error saving image to database:', error);
          alert('Failed to save profile picture. Please try again.');
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      setIsUploading(false);
    }
  };

  /**
   * Commit the staged edits.
   *
   * Sends name, age, bio, the existing photos and the edited preferences, then
   * constructs a fresh `User` from the server's response and hands it to the
   * parent - so any server-side normalisation is reflected in the UI rather than
   * the local guess. Leaves edit mode only on success; a failure keeps the
   * staged values so the user can retry without retyping.
   */
  const handleSaveChanges = async () => {
    try {
      // Prepare update data for the backend
      const updateData = {
        name: editData.name,
        age: editData.age,
        bio: editData.bio,
        photos: currentUser.getPhotos(),
        preferences: editData.preferences
      };

      // Save to database
      const updatedUserData = await authService.updateProfile(updateData);

      // Create updated User instance with the response from server
      const updatedUser = new User(
        updatedUserData.id,
        updatedUserData.email,
        updatedUserData.name,
        updatedUserData.age,
        updatedUserData.gender as 'male' | 'female' | 'non-binary' | 'other',
        updatedUserData.bio,
        updatedUserData.photos,
        updatedUserData.preferences
      );
      
      onProfileUpdate(updatedUser);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    }
  };

  /**
   * Write one staged field. A key prefixed 'preferences.' is routed into the
   * nested preferences object; anything else is a top-level field.
   */
  const handleInputChange = (field: string, value: any) => {
    if (field.includes('preferences.')) {
      const prefKey = field.split('preferences.')[1];
      setEditData(prev => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          [prefKey]: value
        }
      }));
    } else {
      setEditData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  /**
   * Deactivate the account after an explicit confirmation.
   *
   * Calls the server directly rather than through authService, because the
   * implemented route is /api/user/:id/deactivate (authService's own
   * `deactivateAccount` points at a path the server does not define).
   *
   * On success the token is cleared and the page reloaded rather than the view
   * simply changing: every piece of loaded state - matches, conversations, group
   * membership - belongs to an account that has just been removed from all of
   * them, so a full reset is the honest response.
   */
  const handleDeactivateAccount = async () => {
    if (!confirm('Are you sure you want to deactivate your account? This will remove you from any group and delete all your matches/messages. You can reactivate it anytime by logging back in.')) {
      return;
    }

    setIsDeactivating(true);
    try {
      const response = await fetch(`/api/user/${currentUser.getId()}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authService.getToken()}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(result.message);
        // Log out the user
        authService.logout();
        // Reload the page to show login screen
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to deactivate account. Please try again.');
      }
    } catch (error) {
      console.error('Error deactivating account:', error);
      alert('Error deactivating account. Please try again.');
    } finally {
      setIsDeactivating(false);
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-card">
        {/* Profile Header */}
        <div className="profile-header-section">
          <div className="profile-photo-container">
            <img
              src={currentUser.getPhotos()[0] || defaultUserImage}
              alt={currentUser.getName()}
              className="profile-photo"
            />
            <button 
              className="photo-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? '⏳' : '+'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>
          <div className="profile-header-info">
            {isEditing ? (
              <input
                type="text"
                value={editData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="profile-name-edit"
              />
            ) : (
              <h1 className="profile-name-display">{currentUser.getName()}</h1>
            )}
            <p className="profile-email">{currentUser.getEmail()}</p>
          </div>
        </div>

        {/* Profile Details */}
        <div className="profile-details">
          <div className="profile-section">
            <h3>Basic Information</h3>
            <div className="profile-field">
              <label>Age:</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.age}
                  onChange={(e) => handleInputChange('age', parseInt(e.target.value))}
                  min="18"
                  max="100"
                />
              ) : (
                <span>{currentUser.getAge()} years old</span>
              )}
            </div>
            <div className="profile-field">
              <label>Gender:</label>
              <span>{currentUser.getGender()}</span>
            </div>
            <div className="profile-field">
              <label>Bio:</label>
              {isEditing ? (
                <textarea
                  value={editData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              ) : (
                <p>{currentUser.getBio() || 'No bio added yet'}</p>
              )}
            </div>
          </div>

          <div className="profile-section">
            <h3>Preferences</h3>
            <div className="profile-field">
              <label>Age Range:</label>
              {isEditing ? (
                <div className="age-range-inputs">
                  <input
                    type="number"
                    value={editData.preferences.minAge}
                    onChange={(e) => handleInputChange('preferences.minAge', parseInt(e.target.value))}
                    min="18"
                    max="100"
                    placeholder="Min"
                  />
                  <span>to</span>
                  <input
                    type="number"
                    value={editData.preferences.maxAge}
                    onChange={(e) => handleInputChange('preferences.maxAge', parseInt(e.target.value))}
                    min="18"
                    max="100"
                    placeholder="Max"
                  />
                </div>
              ) : (
                <span>{currentUser.getPreferences().minAge} - {currentUser.getPreferences().maxAge} years</span>
              )}
            </div>
            <div className="profile-field">
              <label>Max Rent:</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.preferences.maxRent}
                  onChange={(e) => handleInputChange('preferences.maxRent', parseInt(e.target.value))}
                  min="0"
                />
              ) : (
                <span>${currentUser.getPreferences().maxRent}</span>
              )}
            </div>
            <div className="profile-field">
              <label>Cleanliness Level:</label>
              {isEditing ? (
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={editData.preferences.cleanlinessLevel}
                  onChange={(e) => handleInputChange('preferences.cleanlinessLevel', parseInt(e.target.value))}
                />
              ) : (
                <span>{currentUser.getPreferences().cleanlinessLevel}/5</span>
              )}
            </div>
            <div className="profile-field">
              <label>Noise Tolerance:</label>
              {isEditing ? (
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={editData.preferences.noiseTolerance}
                  onChange={(e) => handleInputChange('preferences.noiseTolerance', parseInt(e.target.value))}
                />
              ) : (
                <span>{currentUser.getPreferences().noiseTolerance}/5</span>
              )}
            </div>
            <div className="profile-field">
              <label>Pet Friendly:</label>
              {isEditing ? (
                <input
                  type="checkbox"
                  checked={editData.preferences.petFriendly}
                  onChange={(e) => handleInputChange('preferences.petFriendly', e.target.checked)}
                />
              ) : (
                <span>{currentUser.getPreferences().petFriendly ? 'Yes' : 'No'}</span>
              )}
            </div>
            <div className="profile-field">
              <label>Smoking Allowed:</label>
              {isEditing ? (
                <input
                  type="checkbox"
                  checked={editData.preferences.smokingAllowed}
                  onChange={(e) => handleInputChange('preferences.smokingAllowed', e.target.checked)}
                />
              ) : (
                <span>{currentUser.getPreferences().smokingAllowed ? 'Yes' : 'No'}</span>
              )}
            </div>
            <div className="profile-field">
              <label>Location:</label>
              <span>{currentUser.getPreferences().location.city}, {currentUser.getPreferences().location.state}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="profile-actions">
          {isEditing ? (
            <>
              <button className="btn btn-primary" onClick={handleSaveChanges}>
                Save Changes
              </button>
              <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>

        {/* Deactivate Account Section */}
        <div className="deactivate-section" style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6'
        }}>
          <h3 style={{ 
            color: '#dc3545', 
            marginBottom: '10px',
            fontSize: '18px',
            fontWeight: '600'
          }}>
            Deactivate Account
          </h3>
          <p style={{ 
            color: '#666',
            marginBottom: '15px',
            fontSize: '14px',
            lineHeight: '1.4'
          }}>
            Deactivating your account will remove you from any group, delete all your matches and messages, 
            and hide your profile from other users. You can reactivate anytime by logging back in.
          </p>
          <button 
            className="btn btn-danger"
            onClick={handleDeactivateAccount}
            disabled={isDeactivating}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: isDeactivating ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: isDeactivating ? 0.6 : 1
            }}
          >
            {isDeactivating ? 'Deactivating...' : 'Deactivate Account'}
          </button>
        </div>
      </div>
    </div>
  );
};