const { parseChecklyDirectory } = require('./file-parser')
const { parseChecksTree } = require('./check-parser')

module.exports = async () => await parseChecksTree(parseChecklyDirectory())

async function x() {
  const a = await parseChecksTree(parseChecklyDirectory())
  console.log(a.checks['browser.yml'].alertChannelSubscriptions)
}

x()
