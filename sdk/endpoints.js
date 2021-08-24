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
  PROJECTS: {
    GET: 'projects',
    DEPLOY: 'projects/deploy',
  },
  SIGNED_URL: 'sockets/signed-url',
}

module.exports = {
  ...ENDPOINTS,
}
