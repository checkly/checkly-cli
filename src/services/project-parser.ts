import * as path from 'path'
import * as fs from 'fs/promises'
import Project from '../constructs/project'
import { Service } from 'ts-node'

export async function parseProject (): Promise<Project> {
  const { logicalId, name, repoUrl } = await readPackageJson()
  const project = new Project(logicalId, { name, repoUrl })

  // TODO: allow users to configure this with glob patterns?
  const ignoreDirectories = new Set(['node_modules', '.git'])

  await loadAllChecklyConfigs(process.cwd(), ignoreDirectories)
  return project
}

async function readPackageJson (): Promise<{ logicalId: string, name: string, repoUrl: string }> {
  try {
    const content = await fs.readFile(path.join(process.cwd(), 'package.json'), { encoding: 'utf8' })
    const packageJson = JSON.parse(content)
    if (!packageJson.checkly) {
      // TODO: Maybe accept the configuration from the command line instead
      throw new Error('No `checkly` section was found in the package.json. Please add a configuration.')
    }
    // TODO: Maybe read the repoUrl from the package json repository field instead?
    // https://docs.npmjs.com/cli/v9/configuring-npm/package-json#repository
    return packageJson.checkly
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new Error('Unable to find package.json. Please run the command from the project root directory.')
    }
    throw err
  }
}

async function loadAllChecklyConfigs (dir: string, ignoreDirectories: Set<string>): Promise<void> {
  const files = await fs.readdir(dir)
  // The files are sorted so that they're always processed in the same order
  for (const file of files.sort()) {
    const filepath = path.join(dir, file)
    const stats = await fs.stat(filepath)
    if (stats.isDirectory() && !ignoreDirectories.has(file)) {
      await loadAllChecklyConfigs(filepath, ignoreDirectories)
    } else {
      if (file === 'checkly.config.js') {
        // TODO: Handle errors in the checkly.config.js files
        await loadChecklyConfigJs(filepath)
      } else if (file === 'checkly.config.ts') {
        await loadChecklyConfigTs(filepath)
      }
    }
  }
}

async function loadChecklyConfigJs (filepath: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const exported = require(filepath)
  if (exported instanceof Function) {
    await exported()
  }
}

async function loadChecklyConfigTs (filepath: string): Promise<void> {
  const tsCompiler = await getTsCompiler()
  tsCompiler.enabled(true)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { default: exported } = require(filepath)
  if (exported instanceof Function) {
    await exported()
  }
  tsCompiler.enabled(false) // Re-disable the TS compiler
}

let tsCompiler: Service
async function getTsCompiler (): Promise<Service> {
  if (tsCompiler) return tsCompiler
  try {
    const tsNode = await import('ts-node')
    tsCompiler = tsNode.register({
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('Please install ts-node to use TypeScript configuration files')
    }
  }
  return tsCompiler
}
