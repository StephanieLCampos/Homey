/**
 * PROFILE COMPONENT - User profile management and editing interface
 * Allows users to view and edit their personal information, photos, and roommate preferences.
 * Handles photo uploads, bio editing, and preference updates for age, cleanliness, etc.
 * Provides form validation and coordinates with authService for profile updates.
 * Displays current profile data and enables real-time preview of profile changes.
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

  const handleDeactivateAccount = async () => {
    if (!confirm('Are you sure you want to deactivate your account? You can reactivate it anytime by logging back in.')) {
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
        alert('Account deactivated successfully. You will now be logged out.');
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
            Deactivating your account will hide your profile from other users and log you out. 
            You can reactivate anytime by logging back in.
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