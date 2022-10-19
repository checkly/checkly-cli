// For the PoC, let's use https://github.com/jest-community/create-jest-runner.
// We can also just create a Jest runner directly (https://jestjs.io/docs/configuration#runner-string)
const { createJestRunner } = require('create-jest-runner');
module.exports = createJestRunner(require.resolve('./run-checks'), {
  getExtraOptions: () => ({
    // Configuring the check run options is a bit akward.
    // Ideally, we would parse the command line options in the `check.js` command using @oclif.
    // jest.run() doesn't appear to have a nice way of propagating a configuration to the runner, though.
    // Instead, we just directly parse the process.argv here.
    // Alternatively, users might be configuring the checkly runner to work with Jest directly, rather than using the Checkly-CLI.
    // In that case, they could pass options in their Jest config. 
    // For an example, see how the jest-eslint-runner works:
    // https://github.com/jest-community/jest-runner-eslint/tree/08fd62868eae88466ce01d17685604cf8b2e7d3f#options
    runLocation: process.argv.includes('--cloud') ? 'cloud' : 'local'
  }),
})
