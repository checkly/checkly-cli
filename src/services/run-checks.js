// TODO: Implement the runner
const { pass, fail } = require('create-jest-runner');

const runTest = ({ testPath, extraOptions }) => {
  const start = Date.now();
  const end = Date.now();

  const { runLocation } = extraOptions

  if (runLocation === 'local') {
    console.log('Running the checks locally...')    
  } else if (runLocation === 'cloud') {
    console.log('Running the checks on Checkly...')
  }
  console.log('Got ', extraOptions)

  // Always mark the test as passed.
  // TODO: Instead, let's execute it with Playwright/Test / Mocha / or even on Checkly
  return pass({ start, end, test: { path: testPath } });
};

module.exports = runTest;
