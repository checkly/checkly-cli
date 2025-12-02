import { defineConfig, globalIgnores } from 'eslint/config'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import stylistic from '@stylistic/eslint-plugin'

// See https://github.com/checkly/eslint-config-checkly/blob/6fe6b28e628f9f46208f80d7c33e2fb4f0a65113/index.js
const checklyStyle = {
  plugins: {
    '@stylistic': stylistic,
  },
  rules: {
    '@stylistic/brace-style': ['error', '1tbs', {
      allowSingleLine: false,
    }],
    '@stylistic/comma-dangle': ['error', 'always-multiline'],
    '@stylistic/arrow-parens': ['error', 'as-needed'],
    '@stylistic/space-before-function-paren': ['error', 'always'],
    'curly': ['error', 'multi-line'],
    'max-len': ['error',
      {
        code: 120,
        ignoreTemplateLiterals: true,
        ignoreStrings: true,
        ignoreComments: true,
      },
    ],
    'no-var': 'error',
    'object-shorthand': ['error', 'always'],
    'require-await': 'error',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    '@stylistic/operator-linebreak': ['error', 'before', {
      overrides: {
        '=': 'after',
        '+=': 'after',
      },
    }],
  },
}

export default defineConfig([
  globalIgnores([
    '**/dist/',
    `**/gen/`,
    '**/__checks__/**/*.spec.{js,ts,mjs}',
    '**/syntax-error*',
    'examples/*',
    '**/*fixtures/',
  ]),
  {
    files: ['**/*.{mjs,cjs,js,mts,cts,ts}'],
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
      stylistic.configs.recommended,
      checklyStyle,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      'no-console': 2,
      'no-restricted-syntax': [
        'error', {
          selector: 'TSEnumDeclaration',
          message: 'Don\'t declare enums, use union types instead',
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
