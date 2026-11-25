// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '.claude/worktrees/**', // other sessions' checkouts, linted in their own runs
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/src-tauri/target/**',
      '**/src-tauri/gen/**',
      '**/*.config.{js,cjs,mjs,ts}',
      '**/next-env.d.ts',
      'supabase/functions/**', // Deno runtime — linted separately
      'docs/**',
      'files/**',
      'files1/**',
      'load/**', // k6 scripts (k6 runtime globals)
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node scripts (build/CI tooling) — declare Node globals.
    files: ['scripts/**/*.{js,mjs,cjs}', '.claude/hooks/**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Non-negotiable rules from docs/06-BUILD-PROMPTS.md P1
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
