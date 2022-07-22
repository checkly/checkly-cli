const PATH = 'alert-channels'

const alertChannels = ({ api, apiVersion = 'v1' }) => {
  function get (id) {
    return api.get(`/${apiVersion}/${PATH}/${id}`)
  }

  function getAll ({ limit, page } = {}) {
    return api.get(`/${apiVersion}/${PATH}`, {
      limit,
      page,
    })
  }

  return {
    getAll,
    get,
  }
}

module.exports = alertChannels
