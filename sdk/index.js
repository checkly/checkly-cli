const axios = require('axios')
const endpoints = require('./endpoints')
const { readdir, readFile } = require('fs/promises')

function init({ api, apiKey, baseURL }) {
  const Authorization = `Bearer ${apiKey}`

  const _api =
    api ||
    axios.create({
      baseURL,
      headers: { Authorization },
    })

  const checks = {
    getAll({ limit, page } = {}) {
      return _api.get(endpoints.CHECKS, { limit, page })
    },

    async getAllLocal() {
      const checks = await readdir(`.checkly/checks`)
      return Promise.all(
        checks.map((check) => readFile(`.checkly/checks/${check}`, 'utf-8'))
      )
    },

    run(check) {
      return _api.post(
        'http://localhost:3000/next/checks/browser-check-runs',
        check
      )
    },

    create({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return _api.post(endpoints.CHECKS, { name, script, checkType, activated })
    },

    get(id) {
      return _api.get(endpoints.CHECKS + '/' + id)
    },

    deploy(checks, flags) {
      const { dryRun } = flags
      return _api.post(
        `http://localhost:3000/next/projects/deploy?dryRun=${dryRun}`,
        checks
      )
    },
  }

  const account = {
    findOne() {
      return _api.get(endpoints.ACCOUNT)
    },
  }

  const checkStatuses = {
    getAll({ limit, page } = {}) {
      return _api.get(endpoints.CHECK_STATUSES, { limit, page })
    },
  }

  const projects = {
    getAll() {
      return _api.get('http://localhost:3000/next/projects')
    },
    create(project) {
      return _api.post('http://localhost:3000/next/projects', project)
    },
  }

  const socket = {
    getSignedUrl() {
      return _api.get('http://localhost:3000/next/sockets/signed-url')
    },
  }

  return {
    checks,
    account,
    checkStatuses,
    projects,
    socket,
  }
}

module.exports = {
  init,
}
