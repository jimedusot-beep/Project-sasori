import js from '@eslint/js';
import globals from 'globals';
export default [
  {
    ignores: [
      '**/node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'native/ios/www/**',
      'native/ios/ios/**',
      'native/ios/build/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'error',
    },
  },
];
