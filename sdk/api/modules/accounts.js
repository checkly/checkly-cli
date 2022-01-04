const PATH = 'accounts'

const accounts = ({ api, apiVersion = 'next' }) => {
  function getAll ({ spinner = true } = {}) {
    return api.get(`/${apiVersion}/${PATH}`, { spinner })
  }

  return {
    getAll
  }
}

module.exports = accounts
