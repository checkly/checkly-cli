import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect, afterAll, beforeAll } from 'vitest'

import { FixtureSandbox } from '../../testing/fixture-sandbox'
import { ParseProjectOutput } from '../../commands/debug/parse-project'

async function parseProject (fixt: FixtureSandbox, ...args: string[]): Promise<ParseProjectOutput> {
  const result = await fixt.run('npx', [
    'checkly',
    'debug',
    'parse-project',
    ...args,
  ])

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  const output: ParseProjectOutput = JSON.parse(result.stdout)

  return output
}

const DEFAULT_TEST_TIMEOUT = 30_000

describe('BrowserCheck', () => {
  let fixt: FixtureSandbox

  beforeAll(async () => {
    fixt = await FixtureSandbox.create({
      source: path.join(__dirname, 'fixtures', 'browser-check'),
    })
  }, 180_000)

  afterAll(async () => {
    await fixt?.destroy()
  })

  it('should correctly load file dependencies', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-code-dependencies/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        sharedFiles: [
          expect.objectContaining({
            path: 'package.json',
            content: fs.readFileSync(fixt.abspath('package.json'), 'utf8'),
          }),
          expect.objectContaining({
            path: 'package-lock.json',
            content: fs.readFileSync(fixt.abspath('package-lock.json'), 'utf8'),
          }),
          expect.objectContaining({
            path: 'test-cases/test-code-dependencies/dep1.js',
            content: fs.readFileSync(fixt.abspath('test-cases/test-code-dependencies/dep1.js'), 'utf8'),
          }),
          expect.objectContaining({
            path: 'test-cases/test-code-dependencies/dep2.js',
            content: fs.readFileSync(fixt.abspath('test-cases/test-code-dependencies/dep2.js'), 'utf8'),
          }),
        ],
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              scriptPath: 'test-cases/test-code-dependencies/entrypoint.js',
              script: fs.readFileSync(fixt.abspath('test-cases/test-code-dependencies/entrypoint.js'), 'utf8'),
              dependencies: [
                0,
                1,
                2,
                3,
              ],
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  // it('should fail to bundle if runtime is not specified and default runtime is not set', async () => {
  //   const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
  //   const bundle = async () => {
  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const _bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), undefined)
  //   }

  //   Session.basePath = __dirname
  //   Session.availableRuntimes = runtimes
  //   Session.defaultRuntimeId = undefined
  //   await expect(bundle()).rejects.toThrow('runtime is not set')
  //   Session.basePath = undefined
  //   Session.defaultRuntimeId = undefined
  // }, DEFAULT_TEST_TIMEOUT)

  // it('should successfully bundle if runtime is not specified but default runtime is set', async () => {
  //   const getFilePath = (filename: string) => path.join(__dirname, 'fixtures', 'api-check', filename)
  //   const bundle = async () => {
  //     // eslint-disable-next-line @typescript-eslint/no-unused-vars
  //     const _bundle = await BrowserCheck.bundle(getFilePath('entrypoint.js'), undefined)
  //   }

  //   Session.basePath = __dirname
  //   Session.availableRuntimes = runtimes
  //   Session.defaultRuntimeId = '2022.10'
  //   await expect(bundle()).resolves.not.toThrow()
  //   Session.basePath = undefined
  //   Session.defaultRuntimeId = undefined
  // }, DEFAULT_TEST_TIMEOUT)

  it('should fail to bundle if runtime is not supported even if default runtime is set', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-invalid-runtime/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: true,
        benign: false,
        observations: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('is not a known runtime.'),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should synthesize runtime if specified', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-runtime/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check-with-runtime',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              runtimeId: '2025.04',
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should not synthesize default runtime', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-runtime/checkly.config.js'),
      '--default-runtime',
      '2024.09',
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check-without-runtime',
            type: 'check',
            member: true,
            // The default runtime is used for sanity checks but is not
            // serialized. This is done so that all checks can be changed
            // at once by changing the account default runtime.
            payload: expect.not.objectContaining({
              runtimeId: expect.anything(),
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should apply default check settings', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-check-defaults/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check-should-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['default tags'],
            }),
          }),
          expect.objectContaining({
            logicalId: 'check-should-not-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['not default tags'],
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should apply browser check defaults instead of generic check defaults', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-browser-check-defaults/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'check-should-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['browser default tags'],
            }),
          }),
          expect.objectContaining({
            logicalId: 'check-should-not-have-defaults',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              tags: ['not default tags'],
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should support setting groups with `groupId`', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-groupId-mapping/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'test-group',
            type: 'check-group',
            member: true,
          }),
          expect.objectContaining({
            logicalId: 'check',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              groupId: {
                ref: 'test-group',
              },
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  it('should support setting groups with `group`', async () => {
    const output = await parseProject(
      fixt,
      '--config',
      fixt.abspath('test-cases/test-group-mapping/checkly.config.js'),
    )

    expect(output).toEqual(expect.objectContaining({
      diagnostics: expect.objectContaining({
        fatal: false,
      }),
      payload: expect.objectContaining({
        resources: expect.arrayContaining([
          expect.objectContaining({
            logicalId: 'test-group',
            type: 'check-group',
            member: true,
          }),
          expect.objectContaining({
            logicalId: 'check',
            type: 'check',
            member: true,
            payload: expect.objectContaining({
              groupId: {
                ref: 'test-group',
              },
            }),
          }),
        ]),
      }),
    }))
  }, DEFAULT_TEST_TIMEOUT)

  describe('playwrightConfig', () => {
    it('should set from check defaults', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        fixt.abspath('test-cases/test-check-defaults-playwright-config/checkly.config.js'),
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'check-should-have-defaults',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                playwrightConfig: {
                  use: {
                    baseURL: 'https://example.org/check-defaults',
                  },
                },
              }),
            }),
            expect.objectContaining({
              logicalId: 'check-should-not-have-defaults',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                playwrightConfig: {
                  use: {
                    baseURL: 'https://example.org/self',
                  },
                },
              }),
            }),
          ]),
        }),
      }))
    }, DEFAULT_TEST_TIMEOUT)

    it('should set from browser check defaults', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        fixt.abspath('test-cases/test-browser-check-defaults-playwright-config/checkly.config.js'),
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'check-should-have-defaults',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                playwrightConfig: {
                  use: {
                    baseURL: 'https://example.org/browser-defaults',
                  },
                },
              }),
            }),
            expect.objectContaining({
              logicalId: 'check-should-not-have-defaults',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                playwrightConfig: {
                  use: {
                    baseURL: 'https://example.org/self',
                  },
                },
              }),
            }),
          ]),
        }),
      }))
    }, DEFAULT_TEST_TIMEOUT)
  })
})
