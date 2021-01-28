const axios = require('axios')
const endpoints = require('./endpoints')

function init ({ api, apiKey }) {
  if (!apiKey) {
    throw new Error('Missing API Key')
  }

  const Authorization = `Bearer ${apiKey}`

  const _api =
    api ||
    axios.create({
      baseURL: 'https://api.checklyhq.com/v1',
      headers: { Authorization }
    })

  const checks = {
    getAll ({ limit, page } = {}) {
      return _api.get(endpoints.CHECKS, { limit, page })
    },

    create ({ script, name, checkType = 'BROWSER', activated = true } = {}) {
      return _api.post(endpoints.CHECKS, { name, script, checkType, activated })
    }
  }

  return {
    checks
  }
}

module.exports = {
  init
}
