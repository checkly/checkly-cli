/* eslint-disable @typescript-eslint/no-require-imports */
import { Service } from 'ts-node'

export async function loadFile (filepath: string): Promise<any> {
  try {
    let exported: any
    if (/\.[mc]?ts$/.test(filepath)) {
      exported = await loadTsFileDefault(filepath)
    } else {
      const imported = await import(filepath)
      exported = imported.default ?? {}
    }
    if (typeof exported === 'function') {
      exported = await exported()
    }
    return exported
  } catch (err: any) {
    throw new Error(`Error loading file ${filepath}\n${err.stack}`)
  }
}

async function loadTsFileDefault (filepath: string): Promise<any> {
  const jiti = await getJiti()
  if (jiti) {
    return jiti.import<any>(filepath, {
      default: true,
    })
  }

  // Backward-compatibility for users who installed ts-node.
  const tsCompiler = await getTsNodeService()
  if (tsCompiler) {
    tsCompiler.enabled(true)
    let exported: any
    try {
      exported = (await require(filepath)).default
    } catch (err: any) {
      if (err.message && err.message.includes('Unable to compile TypeScript')) {
        throw new Error(`Consider installing "jiti" instead of "ts-node" for improved TypeScript support\n${err.stack}`)
      }
      throw err
    } finally {
      tsCompiler.enabled(false) // Re-disable the TS compiler
    }
    return exported
  }

  throw new Error('Please install "jiti" to use TypeScript files')
}

// Regular type import gave issue with jest.
type Jiti = ReturnType<(typeof import('jiti', {
  with: {
    'resolution-mode': 'import'
  }
}))['createJiti']>

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import jiti
let jiti: Jiti
let haveJiti = false
async function getJiti (): Promise<Jiti | undefined> {
  if (haveJiti) return jiti
  try {
    const maybeJiti = await import('jiti')
    // Jiti 1x does not have createJiti().
    if (typeof maybeJiti.createJiti !== 'function') {
      return
    }
    jiti = maybeJiti.createJiti(__filename)
    haveJiti = true
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      return undefined
    }
    throw err
  }
  return jiti
}

// To avoid a dependency on typescript for users with no TS checks, we need to dynamically import ts-node
let tsNodeService: Service
async function getTsNodeService (): Promise<Service | undefined> {
  if (tsNodeService) return tsNodeService
  try {
    const tsNode = await import('ts-node')
    tsNodeService = tsNode.register({
      moduleTypes: {
        '**/*': 'cjs',
      },
      compilerOptions: {
        module: 'CommonJS',
      },
    })
  } catch (err: any) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND') {
      return undefined
    }
    throw err
  }
  return tsNodeService
}
