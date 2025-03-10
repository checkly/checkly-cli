import * as chalk from 'chalk'
import { spinner } from '../utils/terminal'
import { loadPlaywrightConfig } from '../utils/directory'
import * as recast from 'recast'
import * as path from 'path'
import * as fs from 'fs'
import * as ora from 'ora'
import PlaywrightConfigTemplate from '../utils/playwright-config-template'
export async function copyPlaywrightConfig (dirPath: string, playwrightConfigFileName: string) {
  const copySpinner = spinner('Copying your playwright config')
  try {
    const config = await loadPlaywrightConfig(path.join(dirPath, playwrightConfigFileName))
    const pwtConfig = new PlaywrightConfigTemplate(config).getConfigTemplate()
    if (!pwtConfig) {
      return
    }

    const checklyConfig = getChecklyConfigFile()
    if (!checklyConfig) {
      return handleError(copySpinner, 'Could not find your checkly config file')
    }

    const checklyAst = recast.parse(checklyConfig.checklyConfig)
    const checksAst = findPropertyByName(checklyAst, 'checks')
    if (!checksAst) {
      return handleError(copySpinner, 'Could not parse you checkly file correctly')
    }

    const pwtConfigAst = findPropertyByName(recast.parse(pwtConfig), 'playwrightConfig')
    addOrReplacePlaywrightConfig(checksAst.value, pwtConfigAst)
    fs.writeFileSync(path.join(dirPath, checklyConfig.fileName), recast.print(checklyAst, { tabWidth: 2 }).code)
  } catch (e) {
    handleError(copySpinner, e)
  }
  copySpinner.text = chalk.green('Playwright config copied!')
  copySpinner.succeed()
}

function handleError (copySpinner: ora.Ora, message: string | unknown) {
  copySpinner.text = chalk.red('Something went wrong when copying your playwrightConfig file')
  copySpinner.fail()
  // eslint-disable-next-line
  console.error(message)
  process.exit(1)
}

function getChecklyConfigFile (): {checklyConfig: string, fileName: string} | undefined {
  const filenames = [
    'checkly.config.ts',
    'checkly.config.mts',
    'checkly.config.cts',
    'checkly.config.js',
    'checkly.config.mjs',
    'checkly.config.cjs',
  ]
  let config
  for (const configFile of filenames) {
    const dir = path.resolve(path.dirname(configFile))
    if (!fs.existsSync(path.resolve(dir, configFile))) {
      continue
    }
    const file = fs.readFileSync(path.resolve(dir, configFile))
    if (file) {
      config = {
        checklyConfig: file.toString(),
        fileName: configFile,
      }
      break
    }
  }
  return config
}

function findPropertyByName (ast: any, name: string):
    recast.types.namedTypes.Property | undefined {
  let node
  recast.visit(ast, {
    visitProperty (path: any) {
      if (path.node.key.name === name) {
        node = path.node
      }
      return false
    },
  })
  return node
}

function addOrReplacePlaywrightConfig (ast: any, node: any) {
  const playWrightConfig = findPropertyByName(ast, 'playwrightConfig')
  if (playWrightConfig) {
    playWrightConfig.value = node.value
  } else {
    ast.properties.push(node)
  }
}
