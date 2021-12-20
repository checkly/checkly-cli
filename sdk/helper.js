const { join } = require('path')
const { statSync, readdirSync } = require('fs')

const getLocalFiles = (path, fileContents = []) => {
  const fileNames = readdirSync(path)

  fileNames.forEach((file) => {
    if (statSync(path + '/' + file).isDirectory()) {
      fileContents = getLocalFiles(path + '/' + file, fileContents)
    } else {
      fileContents.push(join(path, '/', file))
    }
  })
  return fileContents
}

module.exports = {
  getLocalFiles
}
