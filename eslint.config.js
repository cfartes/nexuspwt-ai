import gts from 'gts';
import ignores from './eslint.ignores.js';

export default [
  { ignores },
  ...gts,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
  },
];
