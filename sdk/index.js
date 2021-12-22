const endpoints = require('./endpoints')
const path = require('path')
const { getLocalFiles } = require('./helper')
const { readFile } = require('fs/promises')

const PAGINATION_REGEX = /([0-9]+)-([0-9]+)\/([0-9]+)/
const CONTENT_RANGE_HEADER = 'content-range'

function init ({ api, apiVersion = 'v1' }) {
  const checks = {
    async getAll ({ limit, page } = {}) {
      const { data, headers } = await api.get(`/${apiVersion}/${endpoints.CHECKS.GET}`, {
        limit,
        page
      })
      const result = PAGINATION_REGEX.exec(headers[CONTENT_RANGE_HEADER])
      const endIndex = parseInt(result[2])
      const total = parseInt(result[3])
      const hasMore = (endIndex + 1) < total
      return { data, headers, hasMore }
    },

    async getAllLocal () {
      const checks = await getLocalFiles(
        path.join(process.cwd(), '.checkly/checks')
      )

      return Promise.all(
        checks
          .filter((check) => !check.includes('settings.yml'))
          .map((check) => readFile(path.join(check), 'utf-8'))
      )
    },

    run (check) {
      return api.post(`/next/${endpoints.CHECKS.RUN}`, check)
    },

    create ({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return api.post(`/${apiVersion}/${endpoints.CHECKS.GET}`, {
        name,
        script,
        checkType,
        activated
      })
    },

    get (id) {
      return api.get(`/${apiVersion}/${endpoints.CHECKS.GET}/${id}`)
    },

    deploy (resources, flags) {
      const { dryRun } = flags
      return api.post(
        `/next/${endpoints.PROJECTS.DEPLOY}?dryRun=${dryRun}&newSync=true`,
        resources
      )
    }
  }

  const groups = {
    getAll ({ limit, page } = {}) {
      return api.get(`/${apiVersion}/${endpoints.GROUPS.GET}`, {
        limit,
        page
      })
    },

    get (id) {
      return api.get(`/${apiVersion}/${endpoints.GROUPS.GET}/${id}`)
    }
  }

  const accounts = {
    find ({ spinner = true } = {}) {
      return api.get(`/next/${endpoints.ACCOUNTS.GET}`, { spinner })
    }
  }

  const checkStatuses = {
    getAll ({ limit, page } = {}) {
      return api.get(`/${apiVersion}/${endpoints.CHECKS.STATUS}`, {
        limit,
        page
      })
    }
  }

  const projects = {
    getAll () {
      return api.get(`/next/${endpoints.PROJECTS.GET}`)
    },
    create (project) {
      return api.post(`/next/${endpoints.PROJECTS.GET}`, project)
    },
    delete (id) {
      return api.delete(`/next/${endpoints.PROJECTS.DELETE}/${id}?newSync=true`)
    }
  }

  const socket = {
    getSignedUrl () {
      return api.get(`/next/${endpoints.SIGNED_URL.GET}`)
    }
  }

  const locations = {
    getAll () {
      return api.get(`/${apiVersion}/${endpoints.LOCATIONS.GET}`)
    }
  }

  return {
    checks,
    groups,
    accounts,
    checkStatuses,
    projects,
    socket,
    locations
  }
}

module.exports = {
  init
}
