/**
 * AUTHENTICATION SERVICE
 *
 * The client's single point of contact with /api/auth, exported as a singleton
 * so that every part of the app shares one view of the session.
 *
 * It owns the JWT: `setToken` / `getToken` persist it in localStorage under
 * `homey_auth_token`, which is what keeps a user signed in across reloads, and
 * `getAuthHeaders` produces the Authorization header that the rest of the app
 * attaches to its own fetch calls.
 *
 * Every method throws an `Error` carrying the server's message on a non-2xx
 * response, so callers can surface the failure directly. `getCurrentUser` goes
 * further and clears the stored token on a 401, which is how a session for a
 * deleted or deactivated account is ended rather than looping on failed requests.
 *
 * Connections:
 *   - server/routes/auth.js  - the endpoints called.
 *   - client/src/App.tsx     - restores the session on load and holds the user.
 *   - client/src/components/Auth/LoginForm.tsx, RegisterForm.tsx - entry points.
 *   - client/src/components/Profile.tsx - profile updates and deactivation.
 *   - client/src/types/index.ts - `UserData`, `Preferences`.
 *
 * Notes:
 *   - `baseUrl` is the relative path '/api', which works both in production
 *     (server and client on one origin) and in development (the webpack dev
 *     server proxies /api to the backend).
 *   - `deactivateAccount` posts to /api/auth/deactivate, which the server does
 *     not define; the implemented route is /api/user/:id/deactivate in
 *     server/index.js. Documented rather than corrected - this pass is
 *     documentation-only.
 *   - Storing a JWT in localStorage keeps it readable by any script on the
 *     origin; a production deployment would prefer an httpOnly cookie.
 */
import { UserData, Preferences } from '../types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  age: number;
  gender: 'male' | 'female' | 'non-binary' | 'other';
  bio?: string;
  photos?: string[];
  preferences: Preferences;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: UserData;
}

class AuthService {
  private baseUrl = '/api';
  private tokenKey = 'homey_auth_token';

  /**
   * Create an account and start a session.
   * The returned token is stored immediately, so the caller is authenticated as
   * soon as this resolves.
   * @throws Error carrying the server's message on failure.
   */
  async register(userData: RegisterData): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    if (data.token) {
      this.setToken(data.token);
    }

    return data;
  }

  /**
   * Exchange credentials for a token and store it.
   * @throws Error with the server's generic message on bad credentials - the
   *         server does not distinguish unknown email from wrong password.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    if (data.token) {
      this.setToken(data.token);
    }

    return data;
  }

  /**
   * Fetch the signed-in user's profile, used on app start to restore a session
   * from a stored token.
   *
   * A 401 means the token is no longer usable - expired, or its account deleted
   * or deactivated - so the token is cleared before throwing. That is what stops
   * a stale session from persisting.
   *
   * @throws Error when no token is stored or the request fails.
   */
  async getCurrentUser(): Promise<UserData> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseUrl}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      // Clear token for any auth failure (invalid token, user not found, etc.)
      if (response.status === 401) {
        this.logout();
        throw new Error('Authentication failed. Please log in again.');
      }
      throw new Error(data.error || 'Failed to get user data');
    }

    return data.user;
  }

  /**
   * Update the signed-in user's profile. Only the fields the server allows
   * (name, bio, photos, age, preferences) take effect; anything else in the
   * payload is ignored server-side.
   */
  async updateProfile(updates: Partial<UserData>): Promise<UserData> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseUrl}/auth/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }

    return data.user;
  }

  /**
   * Rotate the password. The existing token stays valid afterwards, so the
   * session is not interrupted.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to change password');
    }
  }

  /**
   * Deactivate the account and end the local session.
   *
   * See the note in the file header: the path used here does not correspond to a
   * route the server defines, so this call fails and the local logout below it
   * is never reached.
   */
  async deactivateAccount(): Promise<void> {
    const token = this.getToken();
    if (!token) {
      throw new Error('No authentication token found');
    }

    const response = await fetch(`${this.baseUrl}/auth/deactivate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to deactivate account');
    }

    this.logout();
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Whether a token is present. This is a local check only - it does not
   * validate the token, which is confirmed by the first authenticated request.
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    return !!token;
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  /**
   * Clear all browser storage, not just the token. The blunt recovery path for a
   * session left in an inconsistent state by stale cached data.
   */
  forceLogout(): void {
    localStorage.clear();
    sessionStorage.clear();
  }

  /**
   * Authorization header for the app's own fetch calls, or an empty object when
   * signed out - so it can be spread into a headers literal unconditionally.
   */
  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
}

export const authService = new AuthService();