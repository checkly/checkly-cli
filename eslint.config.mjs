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
    // Holds git worktrees, each a full checkout of the repo with its own
    // in-progress code that must not be linted as part of this checkout.
    '**/.claude/',
    // Scratch space for coding agents (session transcripts, demo tooling),
    // never part of the shipped code.
    '**/.context/',
    '**/dist/',
    `**/gen/`,
    '**/__checks__/**/*.spec.{js,ts,mjs}',
    '**/syntax-error*',
    'examples/*',
    'benchmarks/*',
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
  {
    // `prompts` renders on stdout by default, and stdout carries only command
    // results. The helper renders questions on stderr instead.
    files: ['packages/cli/src/**/*.ts'],
    ignores: [
      'packages/cli/src/helpers/prompts.ts',
      // Only injects answers for e2e tests; renders nothing.
      'packages/cli/src/commands/baseCommand.ts',
      '**/__tests__/**',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'prompts',
          importNames: ['default'],
          message: 'Use `prompt` from helpers/prompts.js, which renders on stderr.',
        }],
      }],
    },
  },
  {
    // The bin launchers are deliberately CommonJS: they must run (and print a
    // useful Node version message) on runtimes far below the supported floor.
    files: ['packages/*/bin/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 0,
      'no-console': 0,
    },
  },
])
