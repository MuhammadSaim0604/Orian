import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config for the whole workspace.
 *
 * The rule that matters most here is `import/no-restricted-paths`: nothing may
 * import from `apps/mobile`, because the engines must stay runnable outside
 * React Native (see conventions/Coding_Conventions.md).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/lib/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/android/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Named exports only in packages, so re-exports stay explicit.
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // Packages must not reach up into the app.
  {
    files: ['packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/apps/**', '@mobile-automation/mobile', '@mobile-automation/mobile/*'],
              message:
                'Packages must not import from apps/mobile. The engines stay runnable outside React Native.',
            },
          ],
        },
      ],
    },
  },

  // React Native app: allow default exports (screens/components) and RN globals.
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        __DEV__: 'readonly',
      },
    },
    rules: {
      'no-restricted-exports': 'off',
    },
  },

  // Tests may be looser.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // CommonJS tooling config and setup files (jest.config.js, jest.setup.js).
  // These run in Node under CJS, so `module` and `require` are expected.
  {
    files: ['**/*.config.js', '**/jest.setup.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
      'no-restricted-exports': 'off',
    },
  },

  // Tool config files legitimately use a default export.
  {
    files: ['**/*.config.{ts,mts,mjs}'],
    rules: {
      'no-restricted-exports': 'off',
    },
  },

  prettier,
);
