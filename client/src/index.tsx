/**
 * REACT ENTRY POINT
 *
 * The client's bootstrap. Webpack is configured to treat this file as the bundle
 * entry; it locates the #root element in the HTML template, creates a React 18
 * root against it and renders <App />. The global stylesheet is imported here so
 * that webpack pulls it into the bundle.
 *
 * The missing-container check throws rather than failing silently: if #root is
 * absent the template and the entry point have diverged, and an explicit error
 * is more useful than a blank page.
 *
 * Connections:
 *   - client/src/App.tsx        - the root component and all application state.
 *   - client/src/index.css      - global styles.
 *   - client/public/index.html  - supplies the #root container.
 *   - client/webpack.config.js  - names this file as the entry point.
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
