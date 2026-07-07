/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
// Exercises Node.js subpath imports (the package.json `imports` field):
//   - `#config`         -> a relative file within the package
//   - `#internal/bar`   -> a wildcard-mapped relative file
//   - `#dep`            -> an external package (lodash)
const config = require('#config')
const bar = require('#internal/bar')
const dep = require('#dep')

module.exports = { config, bar, dep }
