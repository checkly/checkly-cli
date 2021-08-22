const endpoints = require('./endpoints')
const { readdir, readFile } = require('fs/promises')

function init({ api, baseHost, basePath }) {
  const checks = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.CHECKS}`, { limit, page })
    },

    async getAllLocal() {
      const checks = await readdir(`.checkly/checks`)
      return Promise.all(
        checks.map((check) => readFile(`.checkly/checks/${check}`, 'utf-8'))
      )
    },

    run(check) {
      return api.post(`/next/${endpoints.CHECKS_RUN}`, check)
    },

    create({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return api.post(`/${basePath}/${endpoints.CHECKS}`, {
        name,
        script,
        checkType,
        activated,
      })
    },

    get(id) {
      return api.get(`/${basePath}/${endpoints.CHECKS}/${id}`)
    },

    deploy(checks, flags) {
      const { dryRun } = flags
      return api.post(
        `/next/${endpoints.PROJECTS_DEPLOY}?dryRun=${dryRun}`,
        checks
      )
    },
  }

  const account = {
    findOne() {
      return api.get(`/${basePath}/${endpoints.ACCOUNT}`)
    },
  }

  const checkStatuses = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.CHECK_STATUSES}`, {
        limit,
        page,
      })
    },
  }

  const projects = {
    getAll() {
      return api.get(`/next/${endpoints.PROJECTS}`)
    },
    create(project) {
      return api.post(`/next/${endpoints.PROJECTS}`, project)
    },
  }

  const socket = {
    getSignedUrl() {
      return api.get(`/next/${endpoints.SIGNED_URL}`)
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
