const checks = require('./modules/checks')
const groups = require('./modules/groups')
const sockets = require('./modules/sockets')
const accounts = require('./modules/accounts')
const runtimes = require('./modules/runtimes')
const snippets = require('./modules/snippets')
const projects = require('./modules/projects')
const locations = require('./modules/locations')
const checkStatuses = require('./modules/check-statuses')
const alertChannels = require('./modules/alert-channels')

function init ({ api, apiVersion = 'v1' }) {
  return {
    checks: checks({ api, apiVersion }),
    groups: groups({ api, apiVersion }),
    locations: locations({ api, apiVersion }),
    checkStatuses: checkStatuses({ api, apiVersion }),
    runtimes: runtimes({ api, apiVersion }),
    snippets: snippets({ api, apiVersion }),
    alertChannels: alertChannels({ api, apiVersion }),

    accounts: accounts({ api, apiVersion: 'next' }),
    projects: projects({ api, apiVersion: 'next' }),
    sockets: sockets({ api, apiVersion: 'next' }),
  }
}

module.exports = {
  init,
}
