const ENDPOINTS = {
  CHECKS: 'checks',
  CHECKS_RUN: 'checks/browser-check-runs',
  ACCOUNT: 'account',
  CHECK_STATUSES: 'check-statuses',
  SIGNED_URL: 'sockets/signed-url',
  PROJECTS: 'projects',
  PROJECTS_DEPLOY: 'projects/deploy',
}

module.exports = {
  ...ENDPOINTS,
}
