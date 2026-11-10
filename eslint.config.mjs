import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'docs/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
  {
    // These files are inlined into n8n Code nodes, which have no require().
    files: ['src/**/*.js'],
    rules: { 'no-restricted-globals': ['error', 'require', 'process'] },
  },
];
