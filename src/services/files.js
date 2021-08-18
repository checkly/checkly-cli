const fs = require('fs')
const path = require('path')

function getChecklyDirName() {
  return path.join(process.cwd(), './.checkly')
}

function hasChecksDirectory() {
  if (fs.existsSync(getChecklyDirName())) {
    return true
  }

  return false
}

module.exports = {
  hasChecksDirectory,
  getChecklyDirName,
}
