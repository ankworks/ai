import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/worker-configuration.d.ts',
      // Generated SPA asset tree (scripts/assemble-assets.mjs)
      'apps/api/assets/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Worker/runtime + tooling code may use Node globals (process, Buffer in config files only)
    files: ['apps/api/**/*.ts', 'packages/build/**/*.ts', 'vitest.config.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: { 'no-console': 'off' },
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Dev-only helper scripts (mock provider, codemods …) run under plain Node.
    files: ['scripts/**/*.{mjs,js,cjs}'],
    rules: { 'no-console': 'off' },
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
  },
);
