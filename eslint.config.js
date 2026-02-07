import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  // Global ignores.
  {
    ignores: ['dist/**', 'node_modules/**', 'data/**'],
  },

  // Lint JavaScript config/scripts with base JS rules.
  js.configs.recommended,

  // Lint TypeScript source files with both syntax-based and type-aware rules.
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      // Disable ESLint rules that conflict with Prettier formatting.
      prettier,
    ],
    languageOptions: {
      parserOptions: {
        // Enable type-aware lint rules via the dedicated ESLint TSConfig.
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Allow console output for CLI and local development utilities.
      'no-console': 'off',

      // Prefer type-only imports to keep runtime output clean.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // Avoid unused variables; allow leading underscore for intentionally unused params.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Catch missing awaits and promise misuse (high-signal in TS codebases).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],

      // Import hygiene.
      'import/no-duplicates': 'error',
      'import/newline-after-import': 'error',
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
);
