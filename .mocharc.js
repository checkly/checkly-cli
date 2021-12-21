process.env.NODE_ENV = 'test'

module.exports = {
  timeout: 2500,
  recursive: true,
  reporter: 'spec',
  extension: ['js', 'ts'],
  spec: ['test/**/*.spec.js'],
  require: 'test/setup-auth.js',
  'watch-ignore': ['node_modules', '.git', '*~formatting_*'],
}
