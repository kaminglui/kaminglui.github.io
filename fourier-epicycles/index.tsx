import React from 'react';
import ReactDOM from 'react-dom/client';
import { initSiteShell } from '../assets/js/layout/siteShell.js';
import '../assets/js/nav.js';
import App from './App';

initSiteShell('fourier-epicycles');

const rootElement = document.getElementById('fourier-root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
