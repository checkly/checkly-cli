import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { captureDeclaringFile, declaringFileFromFrames, type Frame } from '../declaring-file.js'
import { Session } from '../../session.js'

const ownRoot = '/proj/node_modules/checkly/dist'

const ctor = (fileName: string | null | undefined): Frame => ({ fileName, isConstructor: true })
const code = (fileName: string | null | undefined): Frame => ({ fileName, isConstructor: false })

// Construct -> Check -> ApiCheck.
const CLI_FRAMES = [
  ctor(`${ownRoot}/constructs/construct.js`),
  ctor(`${ownRoot}/constructs/check.js`),
  ctor(`${ownRoot}/constructs/api-check.js`),
]

// Posix fixtures are parsed with posix rules on every platform; the win32
// case below pins its own.
const options = { ownRoot, constructorChainLength: CLI_FRAMES.length, platformPath: path.posix }

describe('declaringFileFromFrames', () => {
  it('returns the first frame outside the CLI', () => {
    const frames = [...CLI_FRAMES, code('/proj/src/shared/alerts.ts'), code('/proj/src/a.check.ts')]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/shared/alerts.ts')
  })

  it('skips a subclass constructor in the user\'s code, since the file that ran `new` declares the construct', () => {
    const frames = [...CLI_FRAMES, ctor('/proj/src/lib/team-check.ts'), code('/proj/src/a.check.ts')]
    expect(declaringFileFromFrames(frames, { ...options, constructorChainLength: 4 })).toBe('/proj/src/a.check.ts')
  })

  it('keeps a helper function in the user\'s code as the declaring file', () => {
    const frames = [...CLI_FRAMES, code('/proj/src/lib/factory.ts'), code('/proj/src/a.check.ts')]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/lib/factory.ts')
  })

  it('keeps a wrapper class in the user\'s code as the declaring file, unlike a subclass', () => {
    // `class Suite { constructor () { new ApiCheck(...) } }` is a helper: its
    // constructor frame lies beyond the construct's own chain.
    const frames = [...CLI_FRAMES, ctor('/proj/src/lib/suite.ts'), code('/proj/src/a.check.ts')]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/lib/suite.ts')
  })

  it('stops skipping early when the chain is shorter than announced', () => {
    const frames = [...CLI_FRAMES, code('/proj/src/a.check.ts')]
    expect(declaringFileFromFrames(frames, { ...options, constructorChainLength: 10 })).toBe('/proj/src/a.check.ts')
  })

  it('skips CLI helpers between constructor frames, as for a group expanding its testMatch', () => {
    const frames = [
      ctor(`${ownRoot}/constructs/construct.js`),
      ctor(`${ownRoot}/constructs/check.js`),
      ctor(`${ownRoot}/constructs/browser-check.js`),
      code(`${ownRoot}/constructs/check-group-v1.js`),
      ctor(`${ownRoot}/constructs/check-group-v1.js`),
      code('/proj/src/group.check.ts'),
    ]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/group.check.ts')
  })

  it('turns a file URL into a path', () => {
    const frames = [...CLI_FRAMES, code('file:///proj/src/a.check.mjs'), code('node:internal/modules/esm/module_job')]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/a.check.mjs')
  })

  it('skips frames without a file, node internals and eval code', () => {
    const frames = [
      ...CLI_FRAMES,
      code(null), code(undefined), code(''), code('node:internal/process/task_queues'), code('<anonymous>'),
      code('/proj/src/a.check.ts'),
    ]
    expect(declaringFileFromFrames(frames, options)).toBe('/proj/src/a.check.ts')
  })

  it('gives up when the first outside frame is a tool under node_modules', () => {
    const frames = [
      ...CLI_FRAMES,
      code(`${ownRoot}/services/project-parser.js`),
      code(`${ownRoot}/commands/deploy.js`),
      code('/proj/node_modules/@oclif/core/lib/command.js'),
      code('node:internal/main/run_main_module'),
    ]
    expect(declaringFileFromFrames(frames, options)).toBeUndefined()
  })

  it('gives up when there are no frames', () => {
    expect(declaringFileFromFrames([], options)).toBeUndefined()
    expect(declaringFileFromFrames(CLI_FRAMES, options)).toBeUndefined()
  })

  it('does not mistake a sibling of the CLI root for CLI code', () => {
    // `/proj/node_modules/checkly/dist-tools` shares a prefix with the root
    // but is not inside it; it is under node_modules, so it is a tool.
    const frames = [...CLI_FRAMES, code('/proj/node_modules/checkly/dist-tools/x.js')]
    expect(declaringFileFromFrames(frames, options)).toBeUndefined()
    expect(declaringFileFromFrames([...CLI_FRAMES, code('/projects/a.check.ts')], { ...options, ownRoot: '/proj' }))
      .toBe('/projects/a.check.ts')
  })

  it('handles Windows paths and file URLs', () => {
    const root = 'C:\\proj\\node_modules\\checkly\\dist'
    const win32 = { ownRoot: root, constructorChainLength: 1, platformPath: path.win32 }
    const frames = [
      ctor('c:\\PROJ\\node_modules\\checkly\\dist\\constructs\\construct.js'),
      code(`${root}\\constructs\\check.js`),
      code('file:///C:/proj/checks/a.check.ts'),
      code('C:\\proj\\checks\\b.check.ts'),
    ]
    expect(declaringFileFromFrames(frames, win32)).toBe('C:\\proj\\checks\\a.check.ts')
    expect(declaringFileFromFrames([code(`${root}\\constructs\\check.js`), code('D:\\other\\a.check.ts')], win32))
      .toBe('D:\\other\\a.check.ts')
    expect(declaringFileFromFrames([code(`${root}\\constructs\\check.js`), code('C:\\proj\\node_modules\\tool\\x.js')], win32))
      .toBeUndefined()
  })
})

describe('captureDeclaringFile', () => {
  let dir: string

  beforeAll(() => {
    // Left unresolved (on macOS the temp dir sits behind a symlink): the
    // loader reports a module it resolved itself at its physical path, and
    // the entry file at the path it was handed.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkly-declaring-file-'))
    const helper = fileURLToPath(new URL('../declaring-file.ts', import.meta.url))
    fs.writeFileSync(path.join(dir, 'base.ts'), [
      `import { captureDeclaringFile } from ${JSON.stringify(helper)}`,
      // Mirrors Construct: the chain length counts the classes from Base down
      // to the one being instantiated, and the capture happens in the
      // constructor body.
      'export class Base {',
      '  declaringFile?: string',
      '  constructor () {',
      '    let chain = 1',
      '    for (let cls = new.target; cls !== Base; cls = Object.getPrototypeOf(cls)) chain++',
      '    this.declaringFile = captureDeclaringFile(chain)',
      '  }',
      '}',
      'export const declaringFile = captureDeclaringFile(0)',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(dir, 'sub.ts'), [
      'import { Base } from \'./base.js\'',
      'export class Sub extends Base {}',
      'export function factory () { return new Sub() }',
      'export class Wrapper { inner = new Sub() }',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(dir, 'entry.ts'), [
      'import { Sub, Wrapper, factory } from \'./sub.js\'',
      'export { declaringFile } from \'./base.js\'',
      'export const viaSubclass = new Sub().declaringFile',
      'export const viaFactory = factory().declaringFile',
      'export const viaWrapper = new Wrapper().inner.declaringFile',
      '',
    ].join('\n'))
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    Session.reset()
  })

  it('finds nothing when called from a test, which runs inside the CLI tree under a tool', () => {
    expect(captureDeclaringFile(0)).toBeUndefined()
  })

  it('names the file whose code ran, not the file that imported it', async () => {
    // The JS realpath, like the loader and the parser use: it resolves the
    // macOS temp-dir symlink but, unlike the native one, does not expand
    // Windows 8.3 short names such as RUNNER~1.
    const real = (name: string) => fs.realpathSync(path.join(dir, name))
    const loaded = await Session.loadFile<Record<string, string | undefined>>(path.join(dir, 'entry.ts'))
    // Top-level code in the imported module, at its physical path.
    expect(loaded.declaringFile).toBe(real('base.ts'))
    // The subclass constructor frame is skipped; the file running `new`
    // counts, and as the entry file it keeps the path it was loaded by.
    expect(loaded.viaSubclass).toBe(path.join(dir, 'entry.ts'))
    // A helper function is not part of the chain, so its file counts.
    expect(loaded.viaFactory).toBe(real('sub.ts'))
    // Nor is a wrapper class, even though its frame is a constructor.
    expect(loaded.viaWrapper).toBe(real('sub.ts'))
  })

  it('leaves the error hooks as they were', () => {
    const before = { prepareStackTrace: Error.prepareStackTrace, stackTraceLimit: Error.stackTraceLimit }
    captureDeclaringFile(1)
    expect(Error.prepareStackTrace).toBe(before.prepareStackTrace)
    expect(Error.stackTraceLimit).toBe(before.stackTraceLimit)
  })
})
