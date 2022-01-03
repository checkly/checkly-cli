const PATH = 'sockets'

const sockets = ({ api, apiVersion = 'next' }) => {
  function getSignedUrl () {
    return api.get(`/${apiVersion}/${PATH}/'signed-url`)
  }

  return {
    getSignedUrl
  }
}

module.exports = sockets
