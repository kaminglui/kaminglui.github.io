import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/',
      'pages/fourier-epicycles/',
      'pages/fourier-epicycles-src/node_modules/',
      'pages/fourier-epicycles-src/dist/',
      'assets/css/tailwind.css',
      '_site/',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
    },
  },
  {
    files: ['**/*.test.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
  prettier,
];
