const list = require('./list')
const create = require('./create')
const deleteProject = require('./delete')

module.exports = {
  create,
  list,
  del: deleteProject
}
