const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    include: ['assets/js/**/*.test.js'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30_000,
    maxWorkers: 1
  }
});
