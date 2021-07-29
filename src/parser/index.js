const { parseChecklyDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

module.exports = () => parseChecksTree(parseChecklyDirectory())
