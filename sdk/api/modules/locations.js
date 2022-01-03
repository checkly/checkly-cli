const PATH = 'locations'

const locations = ({ api, apiVersion = 'v1' }) => {
  function getAll () {
    return api.get(`/${apiVersion}/${PATH}`)
  }

  return {
    getAll
  }
}

module.exports = locations
