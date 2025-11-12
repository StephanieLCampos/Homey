/**
 * REACT ENTRY POINT - Application bootstrap and DOM mounting for Homey client
 * Initializes React application and mounts the main App component to DOM.
 * Sets up React 18 createRoot for concurrent features and proper rendering.
 * Imports global CSS styles and establishes the foundation for the entire client app.
 * This is the starting point that launches the Homey roommate finder interface.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<App />);
