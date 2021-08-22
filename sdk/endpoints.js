const ENDPOINTS = {
  CHECKS: {
    GET: 'checks',
    RUN: 'checks/browser-check-runs',
    STATUS: 'check-statuses',
  },
  ACCOUNTS: {
    GET: 'account',
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
