const path = require('path')
const axios = require('axios')

const dep = require('./dep')

function main () {
  console.log(path.join(__dirname, './'))
  console.log(axios)
  console.log(dep())
}

main()
