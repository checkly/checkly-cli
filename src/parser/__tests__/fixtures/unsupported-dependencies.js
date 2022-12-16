// left-pad and right-pad are important dependencies, but not contained in the runtimes
const leftPad = require('left-pad')
const rightPad = require('right-pad')
// axios is supported, so it shouldn't be included in the error
const axios = require('axios')