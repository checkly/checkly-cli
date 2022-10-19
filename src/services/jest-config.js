module.exports = {
  runner: `${__dirname}/jest-runner.js`,
  displayName: 'Checkly',
  testMatch: ['<rootDir>/**/*.check.js'],
  // Jest assumes that the rootDir is the directory containing the config.
  // We should override that to make the CLI work
  rootDir: process.cwd(),
}
