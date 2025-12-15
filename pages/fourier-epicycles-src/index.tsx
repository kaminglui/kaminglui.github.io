import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

async function initSharedSiteShell() {
  try {
    if (import.meta.env.DEV) {
      const { initSiteShell } = await import('../../assets/js/layout/siteShell.js');
      initSiteShell('fourier-epicycles');
      return;
    }

    const siteShellUrl = new URL('../../assets/js/layout/siteShell.js', window.location.href).toString();
    const { initSiteShell } = await import(/* @vite-ignore */ siteShellUrl);
    initSiteShell('fourier-epicycles');
  } catch (error) {
    console.error('Site shell failed to initialize:', error);
  }
}

const rootElement = document.getElementById('fourier-root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

initSharedSiteShell().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
