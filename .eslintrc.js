/** @type {import('eslint').Linter.BaseConfig} */
module.exports = {
  extends: [
    '@checkly/eslint-config',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/type-annotation-spacing': 2,
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/ban-ts-comment': 0,
    'no-console': 2,
    'no-restricted-syntax': [
      'error', {
        selector: 'TSEnumDeclaration',
        message: "Don't declare enums, use union types instead",
      },
    ],
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: [
    'node_modules',
    '**/__checks__/**/*.spec.{js,ts,mjs}',
    '**/syntax-error*',
    'examples',
  ],
  plugins: [
    '@typescript-eslint',
  ],
  overrides: [
    {
      files: [
        'src/commands/*',
        'src/reporters/*',
      ],
      rules: {
        'no-console': 0,
      },
    },
  ],
}
