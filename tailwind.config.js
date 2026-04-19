/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './404.html',
    './pages/**/*.html',
    './assets/js/**/*.{js,mjs}',
    // Scan Fourier React source (built output is gitignored).
    './pages/fourier-epicycles-src/**/*.{ts,tsx,jsx}',
    // Fourier built HTML mirrors the src template; skip to avoid duplicate scanning.
    '!./pages/fourier-epicycles/index.html'
  ],
  darkMode: 'class',
  theme: {
    extend: {}
  },
  plugins: []
};
