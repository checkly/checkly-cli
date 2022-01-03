const PATH = 'check-statuses'

const checkStatuses = ({ api, apiVersion = 'v1' }) => {
  function getAll ({ limit, page } = {}) {
    return api.get(`/${apiVersion}/${PATH}`, {
      limit,
      page
    })
  }

  return {
    getAll
  }
}

module.exports = checkStatuses
