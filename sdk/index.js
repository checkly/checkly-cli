const endpoints = require('./endpoints')
const { readdir, readFile } = require('fs/promises')

function init({ api, baseHost, basePath }) {
  const checks = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.CHECKS.GET}`, {
        limit,
        page,
      })
    },

    async getAllLocal() {
      const checks = await readdir(`.checkly/checks`)
      return Promise.all(
        checks.map((check) => readFile(`.checkly/checks/${check}`, 'utf-8'))
      )
    },

    run(check) {
      return api.post(`/next/${endpoints.CHECKS.RUN}`, check)
    },

    create({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return api.post(`/${basePath}/${endpoints.CHECKS.GET}`, {
        name,
        script,
        checkType,
        activated,
      })
    },

    get(id) {
      return api.get(`/${basePath}/${endpoints.CHECKS.GET}/${id}`)
    },

    deploy(checks, flags) {
      const { dryRun } = flags
      return api.post(
        `/next/${endpoints.PROJECTS.DEPLOY}?dryRun=${dryRun}`,
        checks
      )
    },
  }

  const account = {
    findOne() {
      return api.get(`/${basePath}/${endpoints.ACCOUNTS.GET}`)
    },
  }

  const checkStatuses = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.CHECKS.STATUS}`, {
        limit,
        page,
      })
    },
  }

  const projects = {
    getAll() {
      return api.get(`/next/${endpoints.PROJECTS.GET}`)
    },
    create(project) {
      return api.post(`/next/${endpoints.PROJECTS.GET}`, project)
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
