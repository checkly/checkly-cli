// For the PoC, let's use https://github.com/jest-community/create-jest-runner.
// We can also just create a Jest runner directly (https://jestjs.io/docs/configuration#runner-string)
const { createJestRunner } = require('create-jest-runner');
console.log('Trying to create runner')
module.exports = createJestRunner(require.resolve('./run-checks'))
