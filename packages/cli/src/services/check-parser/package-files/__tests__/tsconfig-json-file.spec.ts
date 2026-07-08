import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { TSConfigFile, Schema, ResolveExtends, ExtendedConfig } from '../tsconfig-json-file.js'
import { JsonTextSourceFile } from '../json-text-source-file.js'
import { SourceFile, FileMeta } from '../source-file.js'

const ROOT = path.resolve('/proj')

function configFile (filePath: string, data: Schema): JsonTextSourceFile<Schema> {
  const sourceFile = new SourceFile(FileMeta.fromFilePath(filePath), JSON.stringify(data))
  return new JsonTextSourceFile<Schema>(sourceFile, data)
}

// Builds a resolveExtends that maps specifiers to pre-built configs, so the
// chain can be exercised without touching the filesystem.
function resolverFor (configs: Record<string, ExtendedConfig>): ResolveExtends {
  // eslint-disable-next-line require-await
  return async specifier => configs[specifier]
}

describe('TSConfigFile extends', () => {
  it('terminates on a circular extends chain', async () => {
    const a = configFile(path.join(ROOT, 'a.json'), {
      extends: './b.json',
      compilerOptions: { baseUrl: './from-a' },
    })
    const b = configFile(path.join(ROOT, 'b.json'), {
      extends: './a.json',
    })

    const tsconfig = await TSConfigFile.loadFromJsonTextSourceFile(a, resolverFor({
      './b.json': { jsonFile: b, bundle: true },
      './a.json': { jsonFile: a, bundle: true },
    }))

    // Resolves at all (no infinite recursion) and keeps the leaf's baseUrl.
    expect(tsconfig?.baseUrl).toBe(path.join(ROOT, 'from-a'))
  })

  it('resolves inherited outDir/rootDir against the base config directory', async () => {
    const baseDir = path.join(ROOT, 'config')
    const base = configFile(path.join(baseDir, 'tsconfig.base.json'), {
      compilerOptions: { outDir: 'dist', rootDir: 'src' },
    })
    const leaf = configFile(path.join(ROOT, 'tsconfig.json'), {
      extends: './config/tsconfig.base.json',
    })

    const tsconfig = await TSConfigFile.loadFromJsonTextSourceFile(leaf, resolverFor({
      './config/tsconfig.base.json': { jsonFile: base, bundle: true },
    }))

    // A compiled file under the base's outDir maps back to the base's rootDir,
    // both relative to the base config directory rather than the leaf's.
    const lookupPaths = tsconfig!.collectLookupPaths(path.join(baseDir, 'dist', 'foo.js'))
    expect(lookupPaths).toContain(path.join(baseDir, 'src', 'foo.js'))
  })

  it('bundles only the local bases reached through extends', async () => {
    const local = configFile(path.join(ROOT, 'local.json'), {})
    const external = configFile(path.join(ROOT, 'node_modules', 'pkg', 'tsconfig.json'), {})
    const leaf = configFile(path.join(ROOT, 'tsconfig.json'), {
      extends: ['./local.json', 'pkg/tsconfig.json'],
    })

    const tsconfig = await TSConfigFile.loadFromJsonTextSourceFile(leaf, resolverFor({
      './local.json': { jsonFile: local, bundle: true },
      'pkg/tsconfig.json': { jsonFile: external, bundle: false },
    }))

    const bundled = tsconfig!.bundledExtendsSourceFiles.map(file => file.meta.filePath)
    expect(bundled).toEqual([local.sourceFile.meta.filePath])
  })
})
