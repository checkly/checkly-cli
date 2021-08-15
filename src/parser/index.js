const { parseChecklyDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

module.exports = async () => await parseChecksTree(parseChecklyDirectory())
;(async () => {
  const result = await module.exports()
  console.log(JSON.stringify(result, null, 2))
})()
