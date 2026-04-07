/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
// This entrypoint simulates a file (like fsevents.js or any native binding
// wrapper) that directly requires a compiled native addon via a relative
// path. The .node file does not exist on disk in the fixture; the parser
// should skip the import silently rather than reporting it as missing.
const native = require('./native.node')

module.exports = { native }
