// This file matches browserChecks.testMatch, so it will automatically be turned into a browser check

// Require two other files
const dep1 = require('./dep1')
const dep2 = require('./dep2')

// Require an npm package
const axios = require('axios')

function myFunction () {
  return 'It works? ' + dep1.doesItWork() + ' ' + dep2.doesItWork()
}

module.exports = { myFunction }