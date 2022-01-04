const checks = require('./modules/checks')
const groups = require('./modules/groups')
const sockets = require('./modules/sockets')
const accounts = require('./modules/accounts')
const projects = require('./modules/projects')
const locations = require('./modules/locations')
const checkStatuses = require('./modules/check-statuses')

function init ({ api, apiVersion = 'v1' }) {
  return {
    checks: checks({ api, apiVersion }),
    groups: groups({ api, apiVersion }),
    locations: locations({ api, apiVersion }),
    checkStatuses: checkStatuses({ api, apiVersion }),

    accounts: accounts({ api, apiVersion: 'next' }),
    projects: projects({ api, apiVersion: 'next' }),
    sockets: sockets({ api, apiVersion: 'next' })
  }
}

module.exports = {
  init
}
