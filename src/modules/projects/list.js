const consola = require('consola')
const { projects } = require('../../services/api')

const { print } = require('../../services/utils')

async function listProjects ({ output } = {}) {
  try {
    const res = await projects.getAll()
    const allChecks = res.data.map(
      ({
        id,
        name,
        repoUrl,
        /* eslint-disable camelcase */
        created_at,
        updated_at
        /* eslint-enable camelcase */
      }) => ({
        id,
        name,
        repoUrl,
        /* eslint-disable camelcase */
        'created at': created_at,
        'updated at': updated_at
        /* eslint-enable camelcase */

      })
    )

    print(allChecks, { output })
  } catch (err) {
    consola.error(err)
    throw err
  }
}

module.exports = listProjects
