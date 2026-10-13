import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'release/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Pure modules must stay free of Electron and Node so they can run anywhere.
    files: [
      'src/core/**/*.ts',
      'src/creature/**/*.ts',
      'src/behaviors/**/*.ts',
      'src/world/**/*.ts',
      'src/life/**/*.ts',
      'src/ai/**/*.ts',
    ],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'fs', 'path', 'os', 'child_process'].map((name) => ({
            name,
            message: 'Pure modules cannot use Electron or Node APIs.',
          })),
          patterns: [{ group: ['node:*'], message: 'Pure modules cannot use Node APIs.' }],
        },
      ],
    },
  },
);
