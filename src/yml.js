const fs = require('fs')
const path = require('path')
const YAML = require('yaml')

const filePath = path.join(__dirname, '../.checkly/settings.yml')

const file = fs.readFileSync(filePath, 'utf8')
const yml = YAML.parse(file)

console.log(yml)
