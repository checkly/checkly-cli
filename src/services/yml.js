const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const filePath = path.join(__dirname, '../../.checkly/settings.yml')
let yml = null

module.exports = {
  yml,
  load () {
    const file = fs.readFileSync(filePath, 'utf8')
    yml = YAML.parse(file)
  },
  update (yml) {
    fs.writeFileSync(filePath, YAML.stringify(yml), 'utf8')
  }
}
