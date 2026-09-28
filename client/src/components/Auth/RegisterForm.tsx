/**
 * REGISTER FORM COMPONENT
 *
 * Three-step account creation, split so that a new user is not confronted with
 * one very long form:
 *   1. Credentials - name, email, password and confirmation.
 *   2. Profile     - photo, age, gender, bio.
 *   3. Preferences - location, age range, gender preferences, budget,
 *                    cleanliness, noise, pets and smoking.
 *
 * Validation is per step rather than deferred to submission: `handleNextStep`
 * refuses to advance until the current step is valid, so an error is reported
 * next to the fields that caused it. The final step's checks run in
 * `handleSubmit`, and only then is the account created - a single request
 * carrying the whole profile, after which `authService` stores the token and the
 * user is signed straight in.
 *
 * The photo is read client-side into a base64 data URL and sent inline with the
 * registration payload; there is no separate upload endpoint. The User schema's
 * photo validator accepts data URLs for exactly this reason. Users who skip the
 * step keep the bundled default avatar so their swipe card still renders.
 *
 * Props:
 *   onSuccess       - called after the account is created and the token stored.
 *   onSwitchToLogin - returns to the login form (offered on step 1 only).
 *
 * Connections:
 *   - client/src/services/authService.ts - performs the registration.
 *   - client/src/types/index.ts          - the `Preferences` shape being built.
 *   - client/src/components/Auth/AuthPage.tsx - the parent.
 *   - server/routes/auth.js - POST /api/auth/register, which re-validates
 *                             everything checked here.
 *
 * Note: base64 photos are stored directly in the user document. That is
 * workable at demonstration scale but would not survive real usage; object
 * storage with a URL reference is the natural next step.
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

  /**
   * One controlled-input handler for every field across all three steps.
   *
   * Nesting is expressed through the input's `name`: a name prefixed
   * 'preferences.' writes into the preferences object, 'location.' writes into
   * the nested location object, and anything else is a top-level field. This
   * keeps the markup declarative at the cost of the dispatch below.
   *
   * Checkbox inputs contribute their `checked` value, and number and range
   * inputs are coerced with `Number` so the state never holds numeric strings.
   */
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

  /**
   * Read the chosen file into a base64 data URL and store it as the user's only
   * photo, replacing the default.
   *
   * There is no upload request: the encoded image travels inside the
   * registration payload, which is why the server's photo validator accepts
   * data URLs alongside http URLs and relative paths.
   *
   * Note that FileReader is asynchronous via its `onload` callback, so the
   * surrounding try/catch only covers the synchronous set-up - a read error
   * would leave `isUploading` true.
   */
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

  /**
   * Toggle one gender in or out of the multi-select preference list, since the
   * generic input handler cannot express add-or-remove semantics.
   */
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

  /**
   * Validate the current step and advance.
   *
   * Step 1 requires the mandatory fields, matching passwords and a password of
   * at least eight characters - the same minimum the server enforces. Step 2
   * enforces the 18+ age floor. Failing either keeps the user on the step with
   * an explanatory message rather than surfacing the problem at submission.
   */
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

  /**
   * Validate the preferences step and create the account.
   *
   * Checks location is complete, at least one gender preference is selected, and
   * the age range is not inverted, then submits the whole profile in one
   * request. On success the token is already stored by the service, so
   * `onSuccess` signs the user straight in.
   */
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

      {/*
        Submission is bound only on the final step. On steps 1 and 2 the default
        is suppressed, so pressing Enter in a field cannot create the account
        before the preferences have been filled in.
      */}
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