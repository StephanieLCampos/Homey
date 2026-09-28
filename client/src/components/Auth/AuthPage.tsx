/**
 * AUTH PAGE COMPONENT
 *
 * The signed-out shell. App.tsx renders this instead of the application whenever
 * there is no authenticated user, so it is the entire surface a visitor sees
 * before signing in.
 *
 * Its only state is which of the two forms to show. Each form is given the
 * callback that switches to the other, so the toggle is driven from inside the
 * forms rather than by a separate tab control, and `onAuthSuccess` is passed
 * through unchanged - both paths end the same way.
 *
 * Props:
 *   onAuthSuccess - invoked after a successful login or registration; App.tsx
 *                   uses it to load the now-authenticated user.
 *
 * Connections:
 *   - client/src/components/Auth/LoginForm.tsx, RegisterForm.tsx - the two forms.
 *   - client/src/App.tsx - renders this when unauthenticated.
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
          <h1>Homey</h1>
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