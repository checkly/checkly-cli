// TODO: Implement the runner
const { pass, fail } = require('create-jest-runner');

const runTest = ({ testPath }) => {
  const start = Date.now();
  const end = Date.now();

  // Always mark the test as passed.
  // TODO: Instead, let's execute it with Playwright/Test / Mocha / or even on Checkly
  return pass({ start, end, test: { path: testPath } });
};

module.exports = runTest;
