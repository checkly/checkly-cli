module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    'references-empty': [0, 'never'],
  },
  parserPreset: {
    parserOpts: {
      issuePrefixes: ['[sc'],
    },
  },
}
