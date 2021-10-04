process.env.NODE_ENV = 'test'
process.env.CHECKLY_API_KEY = 'test123'

module.exports = {
  timeout: 2500,
  recursive: true,
  reporter: 'spec',
  extension: ['js', 'ts'],
  spec: ['test/**/*.spec.js'],
  'watch-ignore': ['node_modules', '.git', '*~formatting_*'],
}
