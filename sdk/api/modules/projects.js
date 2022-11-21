const PATH = 'projects'

const projects = ({ api, apiVersion = 'next' }) => {
  function getAll () {
    return api.get(`/${apiVersion}/${PATH}`)
  }

  function get (id) {
    return api.get(`/${apiVersion}/${PATH}/${id}`)
  }

  function create (project) {
    return api.post(`/${apiVersion}/${PATH}`, project)
  }

  function deleteProject (id) {
    return api.delete(`/${apiVersion}/${PATH}/${id}`)
  }

  function deploy (resources, { dryRun = false } = {}) {
    return api.post(
      `/${apiVersion}/${PATH}/deploy?dryRun=${dryRun}`,
      resources,
    )
  }

  return {
    getAll,
    get,
    create,
    deploy,
    delete: deleteProject,
  }
}

module.exports = projects
