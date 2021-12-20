const list = require('./list')
const deleteProject = require('./delete')

module.exports = {
  list,
  del: deleteProject
}
