/**
 * AUTH PAGE COMPONENT - Main authentication interface with login/register toggle
 * Provides unified entry point for user authentication with tab switching.
 * Manages state between login and registration forms and handles authentication success.
 * Displays welcome messaging and coordinates authentication flow with child components.
 * Responsive design for mobile and desktop authentication experience.
 */
import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';

interface AuthPageProps {
  onAuthSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <h1>🏠 Homey</h1>
          <p>Find your perfect roommate match</p>
        </div>

        {isLogin ? (
          <LoginForm 
            onSuccess={onAuthSuccess}
            onSwitchToRegister={() => setIsLogin(false)}
          />
        ) : (
          <RegisterForm
            onSuccess={onAuthSuccess}
            onSwitchToLogin={() => setIsLogin(true)}
          />
        )}
      </div>
    </div>
  );
};