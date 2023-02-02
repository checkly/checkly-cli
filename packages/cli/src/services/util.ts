import * as path from 'path'
import * as fs from 'fs/promises'
import { Service } from 'ts-node'

// TODO: Remove this in favor of glob? It's unused.
export async function walkDirectory (
  directory: string,
  ignoreDirectories: Set<string>,
  callback: (filepath: string) => Promise<void>,
): Promise<void> {
  const files = await fs.readdir(directory)
  for (const file of files.sort()) {
    const filepath = path.join(directory, file)
    const stats = await fs.stat(filepath)
    if (stats.isDirectory() && !ignoreDirectories.has(file)) {
      await walkDirectory(filepath, ignoreDirectories, callback)
    } else {
      await callback(filepath)
    }
  }
}

export async function loadJsFile (filepath: string): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let exported = require(filepath)
  if (exported instanceof Function) {
    exported = await exported()
  }
  return exported
}

export async function loadTsFile (filepath: string): Promise<any> {
  const tsCompiler = await getTsCompiler()
  tsCompiler.enabled(true)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let { default: exported } = require(filepath)
  if (exported instanceof Function) {
    exported = await exported()
  }
  tsCompiler.enabled(false) // Re-disable the TS compiler
  return exported
}

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import ts-node
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
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install ts-node and typescript to use TypeScript configuration files')
    }
    throw err
  }
  return tsCompiler
}
