const ENDPOINTS = {
  CHECKS: {
    GET: 'checks',
    RUN: 'checks/browser-check-runs',
    STATUS: 'check-statuses',
  },
  ACCOUNTS: {
    GET: 'accounts',
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
  USERS: {
    GET: 'users/me/api-keys',
  },
}

module.exports = {
  ...ENDPOINTS,
}
