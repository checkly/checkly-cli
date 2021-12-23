const consola = require('consola')
const { projects } = require('../../services/api')

async function create ({ name, repoUrl }) {
  try {
    const { data } = await projects.create({ name, repoUrl })

    consola.success(`Project ${data.id} created \n`)
    return data
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = create
