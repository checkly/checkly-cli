/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
// Requires a local package directory that exposes its entry point only through
// the package.json `exports` field (no `main`), so the target file is found
// solely via exports resolution.
const pkg = require('./local-pkg')

module.exports = { pkg }
