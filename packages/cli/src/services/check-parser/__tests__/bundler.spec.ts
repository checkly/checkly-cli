import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { list } from 'tar'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Bundler } from '../bundler.js'

describe('Bundler', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'checkly-bundler-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('does not archive a symlink when files below it are selected', async () => {
    const packagePath = path.join(root, 'packages', 'shared-package')
    const linkedPackagePath = path.join(
      root,
      'packages',
      'app',
      'node_modules',
      '@workspace',
      'shared-package',
    )
    const packageJsonPath = path.join(packagePath, 'package.json')
    const sourcePath = path.join(packagePath, 'src', 'index.js')
    const linkedPackageJsonPath = path.join(linkedPackagePath, 'package.json')
    const linkedSourcePath = path.join(linkedPackagePath, 'src', 'index.js')

    await mkdir(path.dirname(linkedPackagePath), { recursive: true })
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(packageJsonPath, '{"name":"@workspace/shared-package"}')
    await writeFile(sourcePath, 'export const value = true\n')
    await symlink('../../../shared-package', linkedPackagePath, 'dir')

    const bundler = await Bundler.create({
      cacheHash: 'cache-hash',
      tempDir: root,
      stripPrefix: root,
    })
    bundler.registerFiles(
      { filePath: packageJsonPath, physical: true },
      { filePath: sourcePath, physical: true },
      { filePath: linkedPackagePath, physical: true },
      { filePath: linkedPackageJsonPath, physical: true },
      { filePath: linkedSourcePath, physical: true },
    )

    const archive = await bundler.finalize()
    const archivePaths: string[] = []
    await list({
      file: archive.archiveFile,
      onReadEntry: entry => archivePaths.push(entry.path),
    })

    expect(archivePaths.sort()).toEqual([
      'packages/app/node_modules/@workspace/shared-package/package.json',
      'packages/app/node_modules/@workspace/shared-package/src/index.js',
      'packages/shared-package/package.json',
      'packages/shared-package/src/index.js',
    ])
  })

  it('archives a symlink when no files below it are selected', async () => {
    const packagePath = path.join(root, 'packages', 'shared-package')
    const linkedPackagePath = path.join(
      root,
      'packages',
      'app',
      'node_modules',
      '@workspace',
      'shared-package',
    )

    await mkdir(path.dirname(linkedPackagePath), { recursive: true })
    await mkdir(packagePath, { recursive: true })
    await symlink('../../../shared-package', linkedPackagePath, 'dir')

    const bundler = await Bundler.create({
      cacheHash: 'cache-hash',
      tempDir: root,
      stripPrefix: root,
    })
    bundler.registerFiles({ filePath: linkedPackagePath, physical: true })

    const archive = await bundler.finalize()
    const archiveEntries: Array<{
      path: string
      type: string
      linkpath: string
    }> = []
    await list({
      file: archive.archiveFile,
      onReadEntry: entry => archiveEntries.push({
        path: entry.path,
        type: entry.type,
        linkpath: entry.linkpath,
      }),
    })

    expect(archiveEntries).toEqual([{
      path: 'packages/app/node_modules/@workspace/shared-package',
      type: 'SymbolicLink',
      linkpath: '../../../shared-package',
    }])
  })
})
