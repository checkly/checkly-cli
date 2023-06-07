module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'references-empty': [1, 'never'],
  },
  parserPreset: {
    parserOpts: {
      issuePrefixes: ['gh', 'sc'],
    },
  },
}
