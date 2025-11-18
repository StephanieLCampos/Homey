/**
 * REGISTER FORM COMPONENT - User registration with profile setup and preferences
 * Comprehensive registration form including personal info, photos, and roommate preferences.
 * Handles multi-step form validation, photo uploads, and preference configuration.
 * Provides detailed roommate preference inputs (age, cleanliness, noise, pets, smoking).
 * Coordinates with authService for account creation and automatic login after registration.
 */
import React, { useState, useRef } from 'react';
import { authService, RegisterData } from '../../services/authService';
import { Preferences } from '../../types';
import defaultUserImage from '../../images/default_user.png';

interface RegisterFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<RegisterData>({
    email: '',
    password: '',
    name: '',
    age: 18,
    gender: 'other',
    bio: '',
    photos: ['/default_user.png'],
    preferences: {
      minAge: 18,
      maxAge: 35,
      preferredGender: ['male', 'female', 'non-binary', 'other'],
      maxRent: 2000,
      cleanlinessLevel: 3,
      noiseTolerance: 3,
      petFriendly: false,
      smokingAllowed: false,
      location: {
        city: '',
        state: ''
      }
    }
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const isNumber = type === 'number' || type === 'range';

    if (name.includes('preferences.')) {
      const prefKey = name.split('preferences.')[1] as keyof Preferences;
      setFormData(prev => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          [prefKey]: isCheckbox ? (e.target as HTMLInputElement).checked 
                   : isNumber ? Number(value) 
                   : value
        }
      }));
    } else if (name.includes('location.')) {
      const locationKey = name.split('location.')[1] as 'city' | 'state';
      setFormData(prev => ({
        ...prev,
        preferences: {
          ...prev.preferences,
          location: {
            ...prev.preferences.location,
            [locationKey]: value
          }
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: isNumber ? Number(value) : value
      }));
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDataUrl = e.target?.result as string;
        setFormData(prev => ({
          ...prev,
          photos: [imageDataUrl]
        }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      setIsUploading(false);
    }
  };

  const handleGenderPreferenceChange = (gender: string) => {
    const typedGender = gender as 'male' | 'female' | 'non-binary' | 'other';
    setFormData(prev => {
      const currentPrefs = prev.preferences.preferredGender;
      const newPrefs = currentPrefs.includes(typedGender)
        ? currentPrefs.filter(g => g !== typedGender)
        : [...currentPrefs, typedGender];
      
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          preferredGender: newPrefs
        }
      };
    });
  };

  const handleNextStep = () => {
    setError('');
    
    if (step === 1) {
      if (!formData.email || !formData.password || !formData.name) {
        setError('Please fill in all required fields');
        return;
      }
      if (formData.password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    }

    if (step === 2) {
      if (formData.age < 18) {
        setError('You must be at least 18 years old');
        return;
      }
    }

    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setStep(step - 1);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.preferences.location.city || !formData.preferences.location.state) {
      setError('Please provide your location');
      return;
    }

    if (formData.preferences.preferredGender.length === 0) {
      setError('Please select at least one gender preference');
      return;
    }

    if (formData.preferences.minAge > formData.preferences.maxAge) {
      setError('Minimum age cannot be greater than maximum age');
      return;
    }

    setIsLoading(true);

    try {
      await authService.register(formData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <div>
      <h2>Create Account</h2>
      <p>Let's get you started with Homey</p>

      <div className="form-group">
        <label htmlFor="name">Full Name *</label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="email">Email *</label>
        <input
          type="email"
          id="email"
          name="email"
          value={formData.email}
          onChange={handleInputChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="password">Password *</label>
        <input
          type="password"
          id="password"
          name="password"
          value={formData.password}
          onChange={handleInputChange}
          required
          minLength={8}
        />
      </div>

      <div className="form-group">
        <label htmlFor="confirmPassword">Confirm Password *</label>
        <input
          type="password"
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h2>About You</h2>
      <p>Help us create your profile</p>

      <div className="form-group">
        <label>Profile Photo</label>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              src={formData.photos?.[0] || defaultUserImage}
              alt="Profile"
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid #f8f9fa',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.1)'
              }}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{
                position: 'absolute',
                bottom: '5px',
                right: '5px',
                width: '35px',
                height: '35px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {isUploading ? '+' : '+'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </div>
          <p style={{ fontSize: '14px', color: '#6c757d', textAlign: 'center', margin: 0 }}>
            Click the camera icon to upload your photo
          </p>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="age">Age *</label>
        <input
          type="number"
          id="age"
          name="age"
          value={formData.age}
          onChange={handleInputChange}
          min="18"
          max="100"
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="gender">Gender *</label>
        <select
          id="gender"
          name="gender"
          value={formData.gender}
          onChange={handleInputChange}
          required
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non-binary">Non-binary</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          name="bio"
          value={formData.bio}
          onChange={handleInputChange}
          placeholder="Tell us a bit about yourself..."
          maxLength={1000}
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <h2>Your Preferences</h2>
      <p>Help us find your perfect roommate match</p>

      <div className="form-group">
        <label htmlFor="location.city">City *</label>
        <input
          type="text"
          id="location.city"
          name="location.city"
          value={formData.preferences.location.city}
          onChange={handleInputChange}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="location.state">State *</label>
        <input
          type="text"
          id="location.state"
          name="location.state"
          value={formData.preferences.location.state}
          onChange={handleInputChange}
          placeholder="e.g., CA, NY, TX"
          required
        />
      </div>

      <div className="form-group">
        <label>Age Range</label>
        <div className="range-inputs">
          <input
            type="number"
            name="preferences.minAge"
            value={formData.preferences.minAge}
            onChange={handleInputChange}
            min="18"
            max="100"
            placeholder="Min"
          />
          <span>to</span>
          <input
            type="number"
            name="preferences.maxAge"
            value={formData.preferences.maxAge}
            onChange={handleInputChange}
            min="18"
            max="100"
            placeholder="Max"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Gender Preferences *</label>
        <div className="checkbox-group">
          {['male', 'female', 'non-binary', 'other'].map((gender) => (
            <label key={gender} className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.preferences.preferredGender.includes(gender as 'male' | 'female' | 'non-binary' | 'other')}
                onChange={() => handleGenderPreferenceChange(gender)}
              />
              {gender.charAt(0).toUpperCase() + gender.slice(1)}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="preferences.maxRent">Maximum Rent Budget</label>
        <input
          type="number"
          name="preferences.maxRent"
          value={formData.preferences.maxRent}
          onChange={handleInputChange}
          min="0"
        />
      </div>

      <div className="form-group">
        <label htmlFor="preferences.cleanlinessLevel">
          Cleanliness Level (1-5): {formData.preferences.cleanlinessLevel}
        </label>
        <input
          type="range"
          name="preferences.cleanlinessLevel"
          value={formData.preferences.cleanlinessLevel}
          onChange={handleInputChange}
          min="1"
          max="5"
        />
      </div>

      <div className="form-group">
        <label htmlFor="preferences.noiseTolerance">
          Noise Tolerance (1-5): {formData.preferences.noiseTolerance}
        </label>
        <input
          type="range"
          name="preferences.noiseTolerance"
          value={formData.preferences.noiseTolerance}
          onChange={handleInputChange}
          min="1"
          max="5"
        />
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="preferences.petFriendly"
            checked={formData.preferences.petFriendly}
            onChange={handleInputChange}
          />
          Pet Friendly
        </label>
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="preferences.smokingAllowed"
            checked={formData.preferences.smokingAllowed}
            onChange={handleInputChange}
          />
          Smoking Allowed
        </label>
      </div>
    </div>
  );

  return (
    <div className="auth-form">
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={step === 3 ? handleSubmit : (e) => e.preventDefault()}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        <div className="form-actions">
          {step > 1 && (
            <button 
              type="button" 
              onClick={handlePrevStep}
              className="btn-secondary"
              disabled={isLoading}
            >
              Back
            </button>
          )}
          
          {step < 3 ? (
            <button 
              type="button" 
              onClick={handleNextStep}
              className="btn-primary"
            >
              Next
            </button>
          ) : (
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </button>
          )}
        </div>
      </form>

      {step === 1 && (
        <div className="auth-switch">
          <p>
            Already have an account?{' '}
            <button 
              type="button" 
              className="link-button" 
              onClick={onSwitchToLogin}
              disabled={isLoading}
            >
              Sign in
            </button>
          </p>
        </div>
      )}
    </div>
  );
};