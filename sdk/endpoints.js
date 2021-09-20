const ENDPOINTS = {
  CHECKS: {
    GET: 'checks',
    RUN: 'checks/browser-check-runs',
    STATUS: 'check-statuses',
  },
  ACCOUNTS: {
    GET: 'account',
  },
  GROUPS: {
    GET: 'check-groups',
  },
  LOCATIONS: {
    GET: 'locations',
  },
  PROJECTS: {
    GET: 'projects',
    DEPLOY: 'projects/deploy',
  },
  SIGNED_URL: {
    GET: 'sockets/signed-url',
  },
}

module.exports = {
  ...ENDPOINTS,
}
