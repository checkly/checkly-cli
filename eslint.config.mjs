import { defineConfig, globalIgnores } from 'eslint/config'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

export default defineConfig([
  globalIgnores([
    '**/dist/',
    '**/__checks__/**/*.spec.{js,ts,mjs}',
    '**/syntax-error*',
    'examples/*',
    '**/*fixtures/',
  ]),
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      'no-console': 2,
      'no-restricted-syntax': [
        'error', {
          selector: 'TSEnumDeclaration',
          message: "Don't declare enums, use union types instead",
        },
      ],
      '@typescript-eslint/no-unused-vars': 1,
      'no-empty': 1,
    },
  },
  {
    files: [
      'src/commands/*',
      'src/reporters/*',
    ],
    rules: {
      'no-console': 0,
    },
  },
])
