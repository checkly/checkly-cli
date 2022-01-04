const PATH = 'checks'

const PAGINATION_REGEX = /([0-9]+)-([0-9]+)\/([0-9]+)/
const CONTENT_RANGE_HEADER = 'content-range'

const checks = ({ api, apiVersion = 'v1' }) => {
  function get (id) {
    return api.get(`/${apiVersion}/${PATH}/${id}`)
  }

  async function getAll ({ limit = 100, page = 1 } = {}) {
    const { data, headers } = await api.get(`/${apiVersion}/${PATH}?limit=${limit}&page=${page}`)
    const result = PAGINATION_REGEX.exec(headers[CONTENT_RANGE_HEADER])
    const endIndex = parseInt(result[2])
    const total = parseInt(result[3])
    const hasMore = (endIndex + 1) < total
    return { data, headers, hasMore }
  }

  function run (check) {
    return api.post(`/next/${PATH}/browser-check-runs`, check)
  }

  function create ({ script, name, checkType = 'BROWSER', activated = true } = {}) {
    return api.post(`/${apiVersion}/${PATH}`, {
      name,
      script,
      checkType,
      activated
    })
  }

  return {
    get,
    getAll,
    create,
    run
  }
}

module.exports = checks
