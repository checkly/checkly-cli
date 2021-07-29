const consola = require('consola')
const { projects } = require('../../services/api')

const { print } = require('../../services/utils')

async function listProjects({ output } = {}) {
  try {
    const res = await projects.getAll()
    // console.log(res)
    const allChecks = res.data.map(
      ({
        id,
        name,
        repoUrl,
        activated,
        muted,
        state,
        accountId,
        /* eslint-disable camelcase */
        created_at,
        updated_at,
        /* eslint-enable camelcase */
      }) => ({
        id,
        name,
        repoUrl,
        activated,
        muted,
        state,
        accountId,
        created_at,
        updated_at,
      })
    )

    print(allChecks, { output })
  } catch (err) {
    consola.error(err)
  }
}

module.exports = listProjects
