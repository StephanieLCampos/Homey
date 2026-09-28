/**
 * LOGIN FORM COMPONENT
 *
 * Email and password sign-in. Holds three pieces of local state - the field
 * values, a loading flag and an error string - and delegates the actual
 * authentication to `authService.login`, which stores the returned token before
 * this component's `onSuccess` fires.
 *
 * Every control is disabled while the request is in flight, which is what
 * prevents a double submission; `finally` clears the flag so the form is usable
 * again after a failure.
 *
 * Errors are shown verbatim from the service. For bad credentials the server
 * returns a single generic message that does not distinguish an unknown email
 * from a wrong password, so the form cannot leak which addresses are registered.
 *
 * Props:
 *   onSuccess          - called once the token is stored.
 *   onSwitchToRegister - switches the parent to the registration form.
 *
 * Connections:
 *   - client/src/services/authService.ts - performs the login.
 *   - client/src/components/Auth/AuthPage.tsx - the parent.
 *   - server/routes/auth.js - POST /api/auth/login.
 */
import React, { useState } from 'react';
import { authService, LoginCredentials } from '../../services/authService';

interface LoginFormProps {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToRegister }) => {
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  /**
   * Generic controlled-input handler: writes the changed field into form state
   * by its `name` attribute, so both inputs share one handler.
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  /**
   * Submit the credentials. Clears any previous error, locks the form for the
   * duration of the request, and either notifies the parent on success or
   * surfaces the service's error message.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await authService.login(formData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Welcome Back</h2>
      <p>Sign in to your Homey account</p>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            disabled={isLoading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
            disabled={isLoading}
          />
        </div>

        <button 
          type="submit" 
          className="btn-primary" 
          disabled={isLoading}
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-switch">
        <p>
          Don't have an account?{' '}
          <button 
            type="button" 
            className="link-button" 
            onClick={onSwitchToRegister}
            disabled={isLoading}
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};