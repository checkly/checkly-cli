module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true
  },
  parser: 'babel-eslint',
  extends: ['prettier', 'standard'],
  plugins: ['prettier'],
  parserOptions: {
    ecmaVersion: 12
  }
}
