module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    mocha: true
  },
  parser: '@babel/eslint-parser',
  extends: ['@checkly/eslint-config', '@checkly/eslint-config/node'],
  parserOptions: {
    requireConfigFile: false,
    ecmaVersion: 12
  }
}
