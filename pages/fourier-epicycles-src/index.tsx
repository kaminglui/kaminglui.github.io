import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

async function initSharedSiteShell() {
  try {
    if (import.meta.env.DEV) {
      const { initMainLayout } = await import('../../assets/js/layout/mainLayout.js');
      initMainLayout('fourier-epicycles');
      return;
    }

    const siteShellUrl = new URL('../../assets/js/layout/mainLayout.js', window.location.href).toString();
    const { initMainLayout } = await import(/* @vite-ignore */ siteShellUrl);
    initMainLayout('fourier-epicycles');
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
