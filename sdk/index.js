const { readdir, readFile } = require('fs/promises')
const axios = require('axios')
const endpoints = require('./endpoints')

function init({ api, apiKey, baseURL }) {
  const Authorization = `Bearer ${apiKey}`

  const _api =
    api ||
    axios.create({
      baseURL: baseURL || 'https://api.checklyhq.com/v1',
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

    async run(check) {
      return _api.post(
        'http://localhost:3000/next/checks/browser-check-runs',
        check[0]
      )
    },

    create({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return _api.post(endpoints.CHECKS, { name, script, checkType, activated })
    },

    get(id) {
      return _api.get(endpoints.CHECKS + '/' + id)
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
  }

  return {
    checks,
    account,
    checkStatuses,
    projects,
  }
}

module.exports = {
  init,
}
