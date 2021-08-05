const { parseChecklyDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

module.exports = async () => await parseChecksTree(parseChecklyDirectory())
;(async () => {
  const tree = await parseChecksTree(parseChecklyDirectory())
  console.log(tree)
})()
