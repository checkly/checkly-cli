const axios = require('axios')
const endpoints = require('./endpoints')

function init({ api, apiKey, baseURL }) {
  if (!apiKey) {
    throw new Error('Missing API Key')
  }

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

  return {
    checks,
    account,
  }
}

module.exports = {
  init,
}
