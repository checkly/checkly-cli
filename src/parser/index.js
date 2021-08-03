const { parseChecklyDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

module.exports = () => parseChecksTree(parseChecklyDirectory())

console.log(JSON.stringify(parseChecksTree(parseChecklyDirectory()), null, 2))
