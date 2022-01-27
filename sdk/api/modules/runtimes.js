const PATH = 'runtimes'

const accounts = ({ api, apiVersion = 'v1' }) => {
  function getAll () {
    return api.get(`/${apiVersion}/${PATH}`)
  }

  function get (id) {
    return api.get(`/${apiVersion}/${PATH}/${id}`)
  }

  return {
    getAll,
    get
  }
}

module.exports = accounts
