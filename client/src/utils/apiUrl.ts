/**
 * API URL UTILITY - Quick fix for API endpoints
 * Converts relative API URLs to absolute URLs pointing to the backend
 */

const API_BASE_URL = 'http://localhost:3333';

export const fixApiUrl = (url: string): string => {
  if (url.startsWith('/api')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
};

export default fixApiUrl;