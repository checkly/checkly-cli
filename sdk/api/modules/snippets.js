const PATH = 'snippets'
const PAGINATION_REGEX = /([0-9]+)-([0-9]+)\/([0-9]+)/
const CONTENT_RANGE_HEADER = 'content-range'

const groups = ({ api, apiVersion = 'v1' }) => {
  function get (id) {
    return api.get(`/${apiVersion}/${PATH}/${id}`)
  }

  async function getAll ({ limit, page } = {}) {
    const { data, headers } = await api.get(`/${apiVersion}/${PATH}?limit=${limit}&page=${page}`)
    if (headers[CONTENT_RANGE_HEADER] === '*/0') {
      return { data: [], headers, hasMore: false }
    }
    const result = PAGINATION_REGEX.exec(headers[CONTENT_RANGE_HEADER])
    const endIndex = parseInt(result[2])
    const total = parseInt(result[3])
    const hasMore = (endIndex + 1) < total
    return { data, headers, hasMore }
  }

  return {
    getAll,
    get,
  }
}

module.exports = groups
