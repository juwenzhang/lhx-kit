// Flat config for ESLint v9. See https://eslint.org/docs/latest/use/configure/configuration-files-new
import eslint from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {jsx: true}
      }
    },
    settings: {
      // Fixed version (not 'detect') because eslint-plugin-react 7.37.x crashes
      // on ESLint 10's API change (`contextOrFilename.getFilename is not a function`).
      // The plugin's auto-detection codepath calls a method that no longer exists.
      react: {version: '19.0'}
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off'
    }
  },
  {
    ignores: [
      'dist',
      'dist-offline',
      'node_modules',
      '.lhx-kit',
      'coverage',
      'playwright-report',
      'test-results',
      'public/mockServiceWorker.js',
      '*.config.js',
      '*.config.ts',
      '*.config.cjs'
    ]
  }
];
