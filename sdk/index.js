const endpoints = require('./endpoints')
const path = require('path')
const { getLocalFiles } = require('./helper')
const { readFile } = require('fs/promises')

function init({ api, baseHost, basePath }) {
  const checks = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.CHECKS.GET}`, {
        limit,
        page,
      })
    },

    async getAllLocal() {
      const checks = await getLocalFiles(
        path.join(process.cwd(), `.checkly/checks`)
      )

      return Promise.all(
        checks
          .filter((check) => !check.includes('settings.yml'))
          .map((check) => readFile(path.join(check), 'utf-8'))
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

  const groups = {
    getAll({ limit, page } = {}) {
      return api.get(`/${basePath}/${endpoints.GROUPS.GET}`, {
        limit,
        page,
      })
    },

    get(id) {
      return api.get(`/${basePath}/${endpoints.GROUPS.GET}/${id}`)
    },
  }

  const accounts = {
    find({ spinner = true } = {}) {
      return api.get(`/next/${endpoints.ACCOUNTS.GET}`, { spinner })
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
      return api.get(`/next/${endpoints.SIGNED_URL.GET}`)
    },
  }

  const locations = {
    getAll() {
      return api.get(`/${basePath}/${endpoints.LOCATIONS.GET}`)
    },
  }

  return {
    checks,
    groups,
    accounts,
    checkStatuses,
    projects,
    socket,
    locations,
  }
}

module.exports = {
  init,
}
