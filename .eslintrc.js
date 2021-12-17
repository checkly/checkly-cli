module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    mocha: true
  },
  parser: "@babel/eslint-parser",
  parserOptions: {
    requireConfigFile: false
  },
  extends: ['@checkly/eslint-config', '@checkly/eslint-config/node'],
  parserOptions: {
    ecmaVersion: 12
  }
}
