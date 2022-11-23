const PATH = 'assets'

const assets = ({ api, apiVersion = 'next' }) => {
  function get (assetType, region, key) {
    return api.get(`/${apiVersion}/${PATH}/${assetType}/${region}/${encodeURIComponent(key)}`)
  }

  return {
    get,
  }
}

module.exports = assets
