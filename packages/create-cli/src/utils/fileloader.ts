/* eslint-disable @typescript-eslint/no-require-imports */
import { Service } from 'ts-node'
import { existsSync } from 'fs'
import * as path from 'path'

export async function loadJsFile (filepath: string): Promise<any> {
  try {
    let { default: exported } = { default: await require(filepath) }
    if (exported instanceof Function) {
      exported = await exported()
    }
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

async function loadTsFile (filepath: string): Promise<any> {
  try {
    const tsCompiler = await getTsCompiler()
    tsCompiler.enabled(true)
    let { default: exported } = await require(filepath)
    if (exported instanceof Function) {
      exported = await exported()
    }
    tsCompiler.enabled(false) // Re-disable the TS compiler
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import ts-node
let tsCompiler: Service
async function getTsCompiler (): Promise<Service> {
  if (tsCompiler) return tsCompiler
  try {
    const tsNode = await import('ts-node')
    tsCompiler = tsNode.register({
      moduleTypes: {
        '**/*': 'cjs',
      },
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      throw new Error('Please install "ts-node" and "typescript" to use TypeScript configuration files')
    }
    throw err
  }
  return tsCompiler
}

export function loadFile (file: string) {
  if (!existsSync(file)) {
    return Promise.resolve(null)
  }
  switch (path.extname(file)) {
    case '.js':
      return loadJsFile(file)
    case '.ts':
      return loadTsFile(file)
    default:
      throw new Error(`Unsupported file extension ${file} for the config file`)
  }
}
