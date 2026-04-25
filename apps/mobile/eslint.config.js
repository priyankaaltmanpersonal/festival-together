const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');
const globals = require('globals');

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: [
      'dist-export/**',
      'coverage/**',
    ],
  },
  {
    files: ['src/__tests__/**/*.js', 'jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    rules: {
      'react/no-unescaped-entities': 'off',
    },
  },
]);
