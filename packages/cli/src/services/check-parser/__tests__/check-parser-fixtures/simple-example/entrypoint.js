// Require two other files
const dep1 = require('./dep1')
const dep2 = require('./dep2')
const moduleImport = require('./module')
const modulePackage = require('./module-package')

// Require an npm package
const axios = require('axios')

function myFunction () {
  return 'It works? ' + dep1.doesItWork() + ' ' + dep2.doesItWork()
}

module.exports = { myFunction }
