import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { list } from 'tar'

import { FixtureSandbox, RunOptions } from '../../testing/fixture-sandbox.js'
import { ParseProjectOutput } from '../../commands/debug/parse-project.js'
import { TarballCache } from '../../services/embedded-packages/cache.js'
import {
  canonicalizePackageJson,
  composeWorkspaceCacheHash,
  loadWorkspaceCacheHashInputs,
  PACKAGE_JSON_EXCLUDED_FIELDS,
} from '../../services/check-parser/cache-hash.js'
import { PNpmDetector } from '../../services/check-parser/package-files/package-manager.js'

async function parseProject (
  fixt: FixtureSandbox,
  ...args: string[]
): Promise<ParseProjectOutput & { stderr: string }> {
  return await parseProjectWithOptions(fixt, {}, ...args)
}

async function parseProjectWithOptions (
  fixt: FixtureSandbox,
  options: RunOptions,
  ...args: string[]
): Promise<ParseProjectOutput & { stderr: string }> {
  const result = await fixt.run('pnpm', [
    'checkly',
    'debug',
    'parse-project',
    ...args,
  ], options)

  if (result.exitCode !== 0) {
    // eslint-disable-next-line no-console
    console.error('stderr', result.stderr)
    // eslint-disable-next-line no-console
    console.error('stdout', result.stdout)
  }

  expect(result.exitCode).toBe(0)

  const output: ParseProjectOutput = JSON.parse(result.stdout)

  return { ...output, stderr: String(result.stderr ?? '') }
}

async function listTarFiles (filePath: string): Promise<string[]> {
  const filenames: string[] = []
  await list({
    file: filePath,
    onReadEntry: entry => filenames.push(entry.path),
  })
  return filenames
}

interface TarEntry {
  path: string
  type: string
  linkpath?: string
}

async function listTarEntries (filePath: string): Promise<TarEntry[]> {
  const entries: TarEntry[] = []
  await list({
    file: filePath,
    onReadEntry: entry => entries.push({
      path: entry.path,
      type: entry.type,
      linkpath: entry.linkpath ?? undefined,
    }),
  })
  return entries
}

async function readTarEntryContent (filePath: string, entryPath: string): Promise<string> {
  const chunks: Buffer[] = []
  let found = false
  await list({
    file: filePath,
    onReadEntry: entry => {
      if (entry.path !== entryPath) {
        return
      }
      found = true
      entry.on('data', chunk => chunks.push(chunk))
    },
  })
  if (!found) {
    throw new Error(`Archive entry not found: ${entryPath}`)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Asserts the one thing an archive must never contain: a symlink with entries
 * beneath it. A path cannot be both a symlink and a directory, and tar refuses
 * to extract an archive that claims otherwise — which is what the CLI produced
 * for any pnpm package reached through node_modules.
 */
function expectNoSymlinkHasChildren (entries: TarEntry[]): void {
  for (const symlink of entries.filter(entry => entry.type === 'SymbolicLink')) {
    const children = entries
      .filter(entry => entry.path.startsWith(`${symlink.path}/`))
      .map(entry => entry.path)

    expect(children, `entries beneath symlink ${symlink.path}`).toEqual([])
  }
}

const DEFAULT_TEST_TIMEOUT = 180_000

describe('PlaywrightCheck', () => {
  it('should synthesize groupName', async () => {
    const fixt = await FixtureSandbox.create({
      template: 'playwright',
      source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupName-mapping'),
    })

    try {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'group',
              type: 'check-group',
              member: true,
              payload: expect.objectContaining({
                name: 'b801a908-8d3c-4a94-92ab-cf15f58a59b4',
              }),
            }),
            expect.objectContaining({
              logicalId: 'check',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                groupId: {
                  ref: 'group',
                },
              }),
            }),
          ]),
        }),
      }))
    } finally {
      await fixt.destroy()
    }
  }, DEFAULT_TEST_TIMEOUT)

  it('should synthesize group', async () => {
    const fixt = await FixtureSandbox.create({
      template: 'playwright',
      source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-group-mapping'),
    })

    try {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'group',
              type: 'check-group',
              member: true,
            }),
            expect.objectContaining({
              logicalId: 'check',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                groupId: {
                  ref: 'group',
                },
              }),
            }),
          ]),
        }),
      }))
    } finally {
      await fixt.destroy()
    }
  }, DEFAULT_TEST_TIMEOUT)

  it('should synthesize groupId', async () => {
    const fixt = await FixtureSandbox.create({
      template: 'playwright',
      source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupId-mapping'),
    })

    try {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'group',
              type: 'check-group',
              member: true,
            }),
            expect.objectContaining({
              logicalId: 'check',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                groupId: {
                  ref: 'group',
                },
              }),
            }),
          ]),
        }),
      }))
    } finally {
      await fixt.destroy()
    }
  }, DEFAULT_TEST_TIMEOUT)

  describe('validation', () => {
    it('should warn that groupName is deprecated', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupName-mapping'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: false,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('Property "groupName" is deprecated and will eventually be removed.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error if groupName is not found', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupName-not-found'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: true,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('The value provided for property "groupName" is not valid.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error if both group and groupName are set', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupName-with-group-conflict'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: true,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('Property "groupName" cannot be set when "group" is set.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error if both groupId and groupName are set', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-groupName-with-groupId-conflict'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: true,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('Property "groupName" cannot be set when "group" is set.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error if retryStrategy is set', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-retryStrategy-not-allowed'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: true,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('Property "retryStrategy" is not supported.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error if doubleCheck is set', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-doubleCheck-not-allowed'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: true,
            benign: false,
            observations: expect.arrayContaining([
              expect.objectContaining({
                message: expect.stringContaining('Property "doubleCheck" is not supported.'),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    describe('test-global-files-bundling-with-projects', () => {
      let fixt: FixtureSandbox
      beforeAll(async () => {
        fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-global-files-bundling-with-projects'),
        })
      }, DEFAULT_TEST_TIMEOUT)

      afterAll(async () => {
        await fixt?.destroy()
      })

      it('should include global files', async () => {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: false,
          }),
          payload: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                logicalId: 'my-check',
                type: 'check',
                member: true,
                payload: expect.objectContaining({
                  codeBundlePath: expect.stringMatching(/.tar.gz$/),
                }),
              }),
            ]),
          }),
        }))

        const {
          codeBundlePath,
        } = output.payload.resources[0].payload as any

        const files = await listTarFiles(codeBundlePath)

        expect(files.sort()).toEqual([
          'lib/setup-util.ts',
          'lib/teardown-util.ts',
          'package.json',
          'playwright.config.ts',
          'pnpm-lock.yaml',
          'setup.ts',
          'teardown.ts',
          'tsconfig.playwright.json',
        ])
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('test-global-files-bundling-without-projects', () => {
      let fixt: FixtureSandbox
      beforeAll(async () => {
        fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-global-files-bundling-without-projects'),
        })
      }, DEFAULT_TEST_TIMEOUT)

      afterAll(async () => {
        await fixt?.destroy()
      })

      it('should include global files', async () => {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: false,
          }),
          payload: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                logicalId: 'my-check',
                type: 'check',
                member: true,
                payload: expect.objectContaining({
                  codeBundlePath: expect.stringMatching(/.tar.gz$/),
                }),
              }),
            ]),
          }),
        }))

        const {
          codeBundlePath,
        } = output.payload.resources[0].payload as any

        const files = await listTarFiles(codeBundlePath)

        expect(files.sort()).toEqual([
          'lib/setup-util.ts',
          'lib/teardown-util.ts',
          'package.json',
          'playwright.config.ts',
          'pnpm-lock.yaml',
          'setup.ts',
          'teardown.ts',
          'tsconfig.playwright.json',
        ])
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('headless', () => {
      it('should error if headless: false is set globally', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-headless-false-not-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: true,
              benign: false,
              observations: expect.arrayContaining([
                expect.objectContaining({
                  message: expect.stringContaining('The value provided for property "headless" is not valid.'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should error if headless: false is set in a project', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-headless-false-in-project-not-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: true,
              benign: false,
              observations: expect.arrayContaining([
                expect.objectContaining({
                  message: expect.stringContaining('The value provided for property "headless" is not valid.'),
                }),
                expect.objectContaining({
                  message: expect.stringContaining('in project "chromium"'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not error if headless: true is set', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-headless-true-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  message: expect.stringContaining('The value provided for property "headless" is not valid.'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not error if headless is not set', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-headless-unset-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  message: expect.stringContaining('The value provided for property "headless" is not valid.'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('webServer', () => {
      it('should warn if webServer is configured in playwright config when running pw-test', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-webServer'),
        })

        try {
          const output = await parseProject(
            fixt,
            '--emulate-pw-test',
          )

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: false,
              observations: expect.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('webServer configuration detected'),
                  message: expect.stringContaining('webServer configuration requires additional files'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not warn about webServer when not running pw-test command', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-webServer'),
        })

        try {
          const output = await parseProject(
            fixt,
          )

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('webServer configuration detected'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not warn about webServer when --include flag is provided', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-webServer'),
        })

        try {
          const output = await parseProject(
            fixt,
            '--emulate-pw-test',
            '--include', 'foobar',
          )

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('webServer configuration detected'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('installCommand', () => {
      it('should warn when installCommand contains playwright install', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-installCommand-unnecessary-playwright-install-warn'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: false,
              observations: expect.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('Unnecessary browser installation detected'),
                  message: expect.stringContaining('installCommand contains "playwright install"'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not warn when installCommand does not contain playwright install', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-installCommand-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('Unnecessary browser installation detected'),
                  message: expect.stringContaining('installCommand contains "playwright install"'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('dependencyCacheVersion', () => {
      it('should change the cacheHash when caching.dependencyCache.version is set', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-dependency-cache-version'),
        })

        const cacheHashFor = async (...args: string[]): Promise<string> => {
          const output = await parseProject(fixt, ...args)
          expect(output.diagnostics).toEqual(expect.objectContaining({
            fatal: false,
          }))
          const check = output.payload.resources.find(resource => resource.type === 'check')!
          const cacheHash = (check.payload as any).cacheHash
          expect(cacheHash).toMatch(/^[0-9a-f]{64}$/)
          return cacheHash
        }

        try {
          const withoutVersion = await cacheHashFor()
          const withVersion = await cacheHashFor('--config', 'checkly.with-version.config.ts')

          expect(withVersion).not.toBe(withoutVersion)
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('runner registries', () => {
      it('ships .checkly/config/registries.json and changes the cacheHash when runner.registries is set', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-runner-registries'),
        })

        const bundleFor = async (...args: string[]): Promise<{ codeBundlePath: string, cacheHash: string }> => {
          const output = await parseProject(fixt, ...args)
          expect(output.diagnostics).toEqual(expect.objectContaining({
            fatal: false,
          }))
          const check = output.payload.resources.find(resource => resource.type === 'check')!
          const { codeBundlePath, cacheHash } = check.payload as any
          expect(cacheHash).toMatch(/^[0-9a-f]{64}$/)
          return { codeBundlePath, cacheHash }
        }

        try {
          const without = await bundleFor()
          expect(await listTarFiles(without.codeBundlePath)).not.toContain('.checkly/config/registries.json')

          const withRegistries = await bundleFor('--config', 'checkly.with-registries.config.ts')
          expect(await listTarFiles(withRegistries.codeBundlePath)).toContain('.checkly/config/registries.json')

          const content = await readTarEntryContent(withRegistries.codeBundlePath, '.checkly/config/registries.json')
          expect(JSON.parse(content)).toEqual({
            version: 1,
            upstreams: {
              internal: {
                // Normalized with the trailing slash the config omits; the
                // token ships unexpanded.
                url: 'https://npm.example.com/npm-group/',
                auth: { type: 'bearer', token: '${INTERNAL_NPM_TOKEN}' },
              },
              npmjs: { url: 'https://registry.npmjs.org/' },
            },
            packages: [
              { pattern: '@acme/**', upstreams: ['internal'] },
              { pattern: '**', upstreams: ['npmjs', 'internal'] },
            ],
          })

          expect(withRegistries.cacheHash).not.toBe(without.cacheHash)
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })

    describe('testCommand', () => {
      it('should warn when testCommand contains playwright install', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-testCommand-unnecessary-playwright-install-warn'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: false,
              observations: expect.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('Unnecessary browser installation detected'),
                  message: expect.stringContaining('testCommand contains "playwright install"'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)

      it('should not warn when testCommand does not playwright install', async () => {
        const fixt = await FixtureSandbox.create({
          template: 'playwright',
          source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-testCommand-allowed'),
        })

        try {
          const output = await parseProject(fixt)

          expect(output).toEqual(expect.objectContaining({
            diagnostics: expect.objectContaining({
              fatal: false,
              benign: true,
              observations: expect.not.arrayContaining([
                expect.objectContaining({
                  title: expect.stringContaining('Unnecessary browser installation detected'),
                  message: expect.stringContaining('testCommand contains "playwright install"'),
                }),
              ]),
            }),
          }))
        } finally {
          await fixt.destroy()
        }
      }, DEFAULT_TEST_TIMEOUT)
    })
  })

  describe('engine version resolution', () => {
    it('should warn when auto-detected Node version is EOL', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-engine-node-eol'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output.diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Node.js 18'),
            }),
          ]),
        )
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should error when auto-detected Bun version is denied', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-engine-bun-denied'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output.diagnostics.fatal).toBe(true)
        expect(output.diagnostics.observations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Bun 2.0'),
            }),
          ]),
        )
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should not produce diagnostics when auto-detected Node version is valid', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-engine-node-valid'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output.diagnostics.observations).toEqual([])
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('defaults', () => {
    it('should ignore retryStrategy from session check defaults', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-retryStrategy-default-ignored'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: false,
          }),
          payload: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                logicalId: 'check',
                type: 'check',
                member: true,
                payload: expect.not.objectContaining({
                  retryStrategy: expect.anything(),
                }),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)

    it('should ignore doubleCheck from session check defaults', async () => {
      const fixt = await FixtureSandbox.create({
        template: 'playwright',
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-doubleCheck-default-ignored'),
      })

      try {
        const output = await parseProject(fixt)

        expect(output).toEqual(expect.objectContaining({
          diagnostics: expect.objectContaining({
            fatal: false,
          }),
          payload: expect.objectContaining({
            resources: expect.arrayContaining([
              expect.objectContaining({
                logicalId: 'check',
                type: 'check',
                member: true,
                payload: expect.not.objectContaining({
                  doubleCheck: true,
                }),
              }),
            ]),
          }),
        }))
      } finally {
        await fixt.destroy()
      }
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should exclude directories matching ignoreDirectoriesMatch pattern', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.exclude-fixtures.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'playwright-check-suite',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                codeBundlePath: expect.stringMatching(/.tar.gz$/),
              }),
            }),
          ]),
        }),
      }))

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files.sort()).toEqual([
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ])
    }, DEFAULT_TEST_TIMEOUT)

    it('should include all directories when ignoreDirectoriesMatch is empty', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.exclude-nothing.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'playwright-check-suite',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                codeBundlePath: expect.stringMatching(/.tar.gz$/),
              }),
            }),
          ]),
        }),
      }))

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files.sort()).toEqual([
        'fixtures/mock-data.json',
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ])
    }, DEFAULT_TEST_TIMEOUT)

    it('should include explicit node_modules patterns bypassing default ignores', async () => {
      // Built at run time as real directories: the sandbox's own top-level
      // node_modules is a symlink to a shared template outside the sandbox,
      // which include patterns are no longer allowed to reach through.
      await fs.mkdir(path.join(fixt.root, 'sub', 'node_modules', 'pkg'), { recursive: true })
      await fs.writeFile(
        path.join(fixt.root, 'sub', 'node_modules', 'pkg', 'package.json'),
        '{"name":"pkg","version":"1.0.0"}',
      )
      await fs.writeFile(
        path.join(fixt.root, 'sub', 'node_modules', 'pkg', 'index.js'),
        'module.exports = {}',
      )

      const output = await parseProject(
        fixt,
        '--config',
        'checkly.include-nested-node-modules.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'playwright-check-suite',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                codeBundlePath: expect.stringMatching(/.tar.gz$/),
              }),
            }),
          ]),
        }),
      }))

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const entries = await listTarEntries(codeBundlePath)
      const files = entries.map(entry => entry.path)

      // The include pattern names a node_modules path, which switches off the
      // default **/node_modules/** ignore — the whole point of this test.
      expect(files.sort()).toEqual(expect.arrayContaining([
        'sub/node_modules/pkg/index.js',
        'sub/node_modules/pkg/package.json',
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ]))
      expectNoSymlinkHasChildren(entries)
    }, DEFAULT_TEST_TIMEOUT)

    it('should fail with a clear error when include reaches through a link pointing outside the project', async () => {
      // The sandbox's top-level node_modules is a symlink to a shared template
      // outside the sandbox — the same shape as a node_modules symlinked to a
      // cache volume. Previously the target's contents were silently flattened
      // into the archive, producing bundles that only half-worked; now it is a
      // fatal diagnostic (which fails `deploy` and `test`).
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.include-node-modules-if-explicit.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining('outside the project\'s bundle root'),
          }),
        ]),
      }))
    }, DEFAULT_TEST_TIMEOUT)

    it('should still respect custom ignoreDirectoriesMatch for explicit patterns', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.exclude-node-modules-if-include-not-explicit.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'playwright-check-suite',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                codeBundlePath: expect.stringMatching(/.tar.gz$/),
              }),
            }),
          ]),
        }),
      }))

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files.sort()).toEqual([
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ])
    }, DEFAULT_TEST_TIMEOUT)

    it('should exclude node_modules with broad patterns despite include', async () => {
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.exclude-prefer-over-include.config.ts',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          resources: expect.arrayContaining([
            expect.objectContaining({
              logicalId: 'playwright-check-suite',
              type: 'check',
              member: true,
              payload: expect.objectContaining({
                codeBundlePath: expect.stringMatching(/.tar.gz$/),
              }),
            }),
          ]),
        }),
      }))

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files.sort()).toEqual([
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ])
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling a pnpm-style node_modules', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-symlinks'),
      })

      // Built here rather than committed: nothing under a node_modules path can
      // be checked in, and the sandbox's own top-level node_modules is a symlink
      // to a template shared by every test — writing through it would corrupt
      // the other tests. This tree is a nested, real node_modules instead.
      const nodeModules = path.join(fixt.root, 'packages', 'e2e', 'node_modules')

      const writeFile = async (relativePath: string, content: string) => {
        const filePath = path.join(nodeModules, relativePath)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, content)
      }

      // The explicit 'dir' type matters on Windows, which otherwise picks the
      // link's type by looking at its target when the link is created — and a
      // target that does not exist yet produces a file-typed link that cannot
      // then be opened as a directory. Other platforms ignore the type.
      const symlink = async (relativePath: string, target: string) => {
        const linkPath = path.join(nodeModules, relativePath)
        await fs.mkdir(path.dirname(linkPath), { recursive: true })
        await fs.symlink(target, linkPath, 'dir')
      }

      // What pnpm builds: packages live in a store, and node_modules holds links
      // into it. A package's own dependencies sit next to it inside the store,
      // not underneath it.
      await writeFile('.pnpm/pkg@1.0.0/node_modules/pkg/index.js', 'module.exports = require(\'dep\')\n')
      await writeFile('.pnpm/pkg@1.0.0/node_modules/pkg/package.json', '{"name":"pkg","version":"1.0.0"}')
      await writeFile('.pnpm/dep@2.0.0/node_modules/dep/index.js', 'module.exports = \'dep\'\n')
      await writeFile('.pnpm/dep@2.0.0/node_modules/dep/package.json', '{"name":"dep","version":"2.0.0"}')
      await symlink('.pnpm/pkg@1.0.0/node_modules/dep', '../../dep@2.0.0/node_modules/dep')
      await symlink('pkg', '.pnpm/pkg@1.0.0/node_modules/pkg')

      // A linked workspace package, which is how a monorepo shares code.
      await symlink('@scope/shared-lib', '../../../shared-lib')

      // A symlinked source directory that a spec imports through. The check
      // parser registers what the spec imports at its path *through* the link,
      // without resolving it — so its files arrive beneath a link the symlink
      // resolver kept, from a code path the resolver never sees.
      await fs.symlink('../shared-helpers', path.join(fixt.root, 'packages', 'e2e', 'helpers'), 'dir')
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should keep symlinks as symlinks and bundle what they point at', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const entries = await listTarEntries(codeBundlePath)

      // The archive has to be extractable. Previously the package symlink and
      // the files reached through it were both archived under the same path,
      // and tar cannot create that.
      expectNoSymlinkHasChildren(entries)

      const symlinks = entries
        .filter(entry => entry.type === 'SymbolicLink')
        .map(entry => `${entry.path} -> ${entry.linkpath}`)
        .sort()

      expect(symlinks).toEqual([
        'packages/e2e/node_modules/.pnpm/pkg@1.0.0/node_modules/dep -> ../../dep@2.0.0/node_modules/dep',
        'packages/e2e/node_modules/@scope/shared-lib -> ../../../shared-lib',
        'packages/e2e/node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
      ])

      const files = entries.map(entry => entry.path)

      // The link targets travel with the links, or nothing resolves on the
      // runner. `dep` is only here because the store directory holding `pkg`
      // was collected too — it is a sibling of pkg, not a child of it.
      expect(files).toEqual(expect.arrayContaining([
        'packages/e2e/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
        'packages/e2e/node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js',
        'packages/shared-lib/src/index.js',
        'packages/shared-lib/package.json',
      ]))

      // The spec imports through the symlinked helpers directory, and the parser
      // registers that import at its path through the link. The file has to be
      // in the archive — and, since it sits beneath the link's path, the link
      // must not also be there, or the archive would not extract.
      expect(files).toContain('packages/e2e/helpers/login.ts')
      expect(symlinks).not.toContain(expect.stringContaining('packages/e2e/helpers ->'))
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling a pnpm workspace with member links', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-workspace-symlinks'),
      })

      // What pnpm builds for workspace dependencies: links straight to the
      // member directories. Built at run time; the explicit 'dir' type is for
      // Windows, which otherwise infers a link's type from its target. The
      // Playwright config's testDir runs *through* the @scope/x link into a
      // subdirectory of the member.
      const cNodeModules = path.join(fixt.root, 'packages', 'c', 'node_modules', '@scope')
      await fs.mkdir(cNodeModules, { recursive: true })
      await fs.symlink(path.join('..', '..', '..', 'x'), path.join(cNodeModules, 'x'), 'dir')

      const xNodeModules = path.join(fixt.root, 'packages', 'x', 'node_modules', '@scope')
      await fs.mkdir(xNodeModules, { recursive: true })
      await fs.symlink(path.join('..', '..', '..', 'w'), path.join(xNodeModules, 'w'), 'dir')

      // A registry dependency in pnpm store shape next to the member link, so
      // the two treatments coexist in one bundle: the store package expands
      // with its sibling closure, the member stays selective.
      const store = path.join(fixt.root, 'packages', 'c', 'node_modules', '.pnpm')
      await fs.mkdir(path.join(store, 'pkg@1.0.0', 'node_modules', 'pkg'), { recursive: true })
      await fs.mkdir(path.join(store, 'dep@2.0.0', 'node_modules', 'dep'), { recursive: true })
      await fs.writeFile(path.join(store, 'pkg@1.0.0', 'node_modules', 'pkg', 'index.js'), 'pkg')
      await fs.writeFile(path.join(store, 'dep@2.0.0', 'node_modules', 'dep', 'index.js'), 'dep')
      await fs.symlink(
        path.join('..', '..', 'dep@2.0.0', 'node_modules', 'dep'),
        path.join(store, 'pkg@1.0.0', 'node_modules', 'dep'),
        'dir',
      )
      await fs.symlink(
        path.join('.pnpm', 'pkg@1.0.0', 'node_modules', 'pkg'),
        path.join(fixt.root, 'packages', 'c', 'node_modules', 'pkg'),
        'dir',
      )
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should bundle members selectively and keep the workspace links resolvable', async () => {
      // DEBUG is scoped to the bundling namespaces so the lockfile-prune
      // skip assertion below can observe the (debug-only) prune activity.
      const result = await fixt.run('pnpm', [
        'checkly', 'debug', 'parse-project', '--config', 'packages/c/checkly.config.ts',
      ], { env: { DEBUG: 'checkly:cli:services:check-parser:*' } })
      expect(result.exitCode).toBe(0)
      const output: ParseProjectOutput = JSON.parse(result.stdout)

      // The member branch announces that it narrows a directly-matched link.
      expect(String(result.stderr)).toContain('resolves to the workspace package')

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const entries = await listTarEntries(codeBundlePath)
      expectNoSymlinkHasChildren(entries)

      const files = entries.filter(entry => entry.type !== 'SymbolicLink').map(entry => entry.path)
      const symlinks = entries
        .filter(entry => entry.type === 'SymbolicLink')
        .map(entry => `${entry.path} -> ${entry.linkpath}`)
        .sort()

      // Exactly these links and no others. X's own @scope/w link is
      // deliberately absent: no include pattern matches it, and like every
      // parser-bundled workspace dependency it is recreated by the runner's
      // install from pnpm-workspace.yaml + the bundled member directories.
      expect(symlinks).toEqual([
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/dep -> ../../dep@2.0.0/node_modules/dep',
        'packages/c/node_modules/@scope/x -> ../../../x',
        'packages/c/node_modules/pkg -> .pnpm/pkg@1.0.0/node_modules/pkg',
      ])

      // The member's exact contribution: manifest, the testDir-discovered spec,
      // its relative import, and the include-matched asset — at real paths,
      // nothing more. not-imported.ts absent is the selectivity claim.
      expect(files.filter(file => file.startsWith('packages/x/')).sort()).toEqual([
        'packages/x/package.json',
        'packages/x/src/assets/data.json',
        'packages/x/src/helper.ts',
        'packages/x/src/tests/flows/checkout.spec.ts',
      ])

      // The member imported by name contributes manifest + entry file.
      expect(files.filter(file => file.startsWith('packages/w/')).sort()).toEqual([
        'packages/w/package.json',
        'packages/w/src/index.js',
      ])

      // The store package expands with its sibling closure, coexisting with the
      // selective member treatment.
      expect(files).toEqual(expect.arrayContaining([
        'packages/c/node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js',
        'packages/c/node_modules/.pnpm/dep@2.0.0/node_modules/dep/index.js',
        'packages/c/playwright.config.ts',
        'pnpm-workspace.yaml',
      ]))

      // Nothing lands at through-link spellings.
      expect(files.filter(file => file.includes('node_modules/@scope/x/'))).toEqual([])

      // Every workspace member's real manifest is in this bundle, so
      // lockfile pruning is skipped — it must not even attempt to run — and
      // the original lockfile ships byte-for-byte. The skip is only visible
      // through the scoped DEBUG output enabled above: the skip reason must
      // appear, and the prune command (recognizable by its --lockfile-only
      // flag) must never be spawned.
      expect(String(result.stderr)).toContain('Lockfile pruning skipped: the bundle contains the full workspace')
      expect(String(result.stderr)).not.toContain('--lockfile-only')
      expect(String(result.stderr)).not.toContain('could not prune the bundled lockfile')
      const archivedLockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')
      const originalLockfile = await fs.readFile(fixt.abspath('pnpm-lock.yaml'), 'utf8')
      expect(archivedLockfile).toEqual(originalLockfile)
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling a pnpm workspace with a pruned lockfile', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-workspace-lockfile-prune'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('prunes the bundled lockfile to the bundle contents and updates the cache hash', async () => {
      const output = await parseProject(fixt, '--config', 'packages/c/checkly.config.ts')

      const {
        codeBundlePath,
        cacheHash,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      // Members: `used` is imported (real files), `shimmed` is declared but
      // unimported (faux manifest only), `opt` is referenced only through
      // `optionalDependencies` — invisible to the parser's faux mechanism,
      // so its manifest reaches the bundle only via the pruner's backfill —
      // and `absent` is referenced by nobody (nothing in the bundle).
      expect(files).toEqual(expect.arrayContaining([
        'pnpm-lock.yaml',
        'packages/used/package.json',
        'packages/used/src/index.js',
        'packages/shimmed/package.json',
        'packages/opt/package.json',
      ]))
      expect(files.filter(file => file.startsWith('packages/absent/'))).toEqual([])

      // The backfilled manifest is a faux shim carrying the real version.
      const optManifest = await readTarEntryContent(codeBundlePath, 'packages/opt/package.json')
      expect(JSON.parse(optManifest)).toMatchObject({
        name: '@fixture-prune/opt',
        version: '1.0.0',
        private: true,
      })

      const lockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')

      // Kept: the imported member's importer and dependency, the shimmed
      // member's importer (its manifest ships as a dep-free shim), and the
      // backfilled member's importer.
      expect(lockfile).toContain('packages/used')
      expect(lockfile).toContain('ms@2.1.3')
      expect(lockfile).toContain('packages/shimmed')
      expect(lockfile).toContain('packages/opt')

      // Dropped: the absent member's importer, and the dependencies of both
      // the shimmed and the absent member.
      expect(lockfile).not.toContain('packages/absent')
      expect(lockfile).not.toContain('isarray')
      expect(lockfile).not.toContain('ee-first')

      // The cache hash must reflect the bundle's actual install inputs: the
      // workspace inputs plus the faux manifests (including the backfilled
      // one) and the pruned lockfile exactly as archived. Recomputing the
      // expected value from the archive contents pins that both bundle-time
      // record types are wired through.
      const shimmedManifest = await readTarEntryContent(codeBundlePath, 'packages/shimmed/package.json')
      const workspace = await new PNpmDetector().lookupWorkspace(fixt.root)
      const expectedHash = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(workspace!), {
        fauxPackageJsons: [
          { path: 'packages/opt/package.json', raw: Buffer.from(optManifest, 'utf8') },
          { path: 'packages/shimmed/package.json', raw: Buffer.from(shimmedManifest, 'utf8') },
        ],
        prunedLockfile: {
          name: 'pnpm-lock.yaml',
          hash: createHash('sha256').update(lockfile).digest(),
        },
      })
      expect(cacheHash).toEqual(expectedHash)
    }, DEFAULT_TEST_TIMEOUT)

    it('still hashes faux manifests when pruning is disabled', async () => {
      const output = await parseProjectWithOptions(
        fixt,
        { env: { CHECKLY_LOCKFILE_PRUNE: '0' } },
        '--config', 'packages/c/checkly.config.ts',
      )

      const {
        codeBundlePath,
        cacheHash,
      } = output.payload.resources[0].payload as any

      // The original lockfile ships unchanged, but the faux manifest is
      // still an install input and must still reach the cache hash. With
      // pruning disabled, no backfill runs either.
      const lockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')
      const originalLockfile = await fs.readFile(fixt.abspath('pnpm-lock.yaml'), 'utf8')
      expect(lockfile).toEqual(originalLockfile)
      const files = await listTarFiles(codeBundlePath)
      expect(files).not.toContain('packages/opt/package.json')

      const shimmedManifest = await readTarEntryContent(codeBundlePath, 'packages/shimmed/package.json')
      const workspace = await new PNpmDetector().lookupWorkspace(fixt.root)
      const expectedHash = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(workspace!), {
        fauxPackageJsons: [
          { path: 'packages/shimmed/package.json', raw: Buffer.from(shimmedManifest, 'utf8') },
        ],
      })
      expect(cacheHash).toEqual(expectedHash)
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling a pnpm workspace with bundle.packages.prune', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-workspace-package-prune'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('prunes the configured packages from the bundled manifests and the lockfile', async () => {
      const output = await parseProject(fixt, '--config', 'packages/c/checkly.config.ts')

      const {
        codeBundlePath,
        cacheHash,
      } = output.payload.resources[0].payload as any

      // The bundled copy of the imported member's manifest lost its pruned
      // peer — the section and its meta emptied out and dropped entirely.
      const usedManifest = await readTarEntryContent(codeBundlePath, 'packages/used/package.json')
      expect(JSON.parse(usedManifest)).toEqual({
        name: '@fixture-prune/used',
        version: '1.0.0',
        private: true,
        main: 'src/index.js',
        dependencies: { ms: '2.1.3' },
      })

      // The fixture's own file is untouched: pruning only rewrites the
      // bundled copy.
      const onDisk = JSON.parse(await fs.readFile(fixt.abspath('packages/used/package.json'), 'utf8'))
      expect(onDisk.peerDependencies).toEqual({ 'ee-first': '1.1.1' })

      // With the peer gone from the bundled manifest, the lockfile-only
      // regeneration cannot re-promote it (auto-install-peers is exactly
      // what put it into the committed lockfile's packages/used importer),
      // so it falls out of the pruned lockfile entirely.
      const lockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')
      expect(lockfile).toContain('packages/used')
      expect(lockfile).toContain('ms@2.1.3')
      expect(lockfile).not.toContain('ee-first')

      // The cache hash reflects the shipped install inputs: the faux
      // manifests hash verbatim, while the prune-rewritten manifest hashes
      // canonicalized, like the on-disk manifest it replaces.
      const optManifest = await readTarEntryContent(codeBundlePath, 'packages/opt/package.json')
      const shimmedManifest = await readTarEntryContent(codeBundlePath, 'packages/shimmed/package.json')
      const workspace = await new PNpmDetector().lookupWorkspace(fixt.root)
      const expectedHash = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(workspace!), {
        fauxPackageJsons: [
          { path: 'packages/opt/package.json', raw: Buffer.from(optManifest, 'utf8') },
          { path: 'packages/shimmed/package.json', raw: Buffer.from(shimmedManifest, 'utf8') },
          {
            path: 'packages/used/package.json',
            raw: canonicalizePackageJson(Buffer.from(usedManifest, 'utf8'), PACKAGE_JSON_EXCLUDED_FIELDS),
          },
        ],
        prunedLockfile: {
          name: 'pnpm-lock.yaml',
          hash: createHash('sha256').update(lockfile).digest(),
        },
      })
      expect(cacheHash).toEqual(expectedHash)
    }, DEFAULT_TEST_TIMEOUT)

    it('does not apply the prune when lockfile pruning is disabled', async () => {
      const output = await parseProjectWithOptions(
        fixt,
        { env: { CHECKLY_LOCKFILE_PRUNE: '0' } },
        '--config', 'packages/c/checkly.config.ts',
      )

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      // Pruned manifests must never ship next to the original lockfile, so
      // disabling lockfile pruning rolls the manifest prune back too.
      const usedManifest = await readTarEntryContent(codeBundlePath, 'packages/used/package.json')
      const onDisk = await fs.readFile(fixt.abspath('packages/used/package.json'), 'utf8')
      expect(usedManifest).toEqual(onDisk)
      const lockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')
      const originalLockfile = await fs.readFile(fixt.abspath('pnpm-lock.yaml'), 'utf8')
      expect(lockfile).toEqual(originalLockfile)
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling a pnpm workspace with a pruned lockfile and embedded packages', () => {
    const MS_INTEGRITY = 'sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA=='

    let fixt: FixtureSandbox
    let cacheDir: string

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-workspace-lockfile-prune-embed'),
      })
      // Only the kept package's tarball is seeded: the dropped package's
      // bytes exist in no cache and on no registry, so any attempt to
      // materialize it would fail the run loudly — this test passing proves
      // it was never requested.
      cacheDir = await seedTarballCache('ms@2.1.3.tgz')
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
      if (cacheDir) {
        await fs.rm(cacheDir, { recursive: true, force: true })
      }
    })

    it('embeds and downloads only the tarballs the pruned lockfile still references', async () => {
      const output = await parseProjectWithOptions(
        fixt,
        { env: { CHECKLY_CACHE_DIR: cacheDir } },
        '--config', 'packages/c/checkly.config.ts',
      )
      expect(output.diagnostics.fatal).toBe(false)

      const {
        codeBundlePath,
        cacheHash,
      } = output.payload.resources[0].payload as any

      // The shimmed member ships as a dep-free faux manifest, so pruning
      // drops its dependency @acme/private-utils from the lockfile — and
      // with it, the embedded tarball for it.
      const lockfile = await readTarEntryContent(codeBundlePath, 'pnpm-lock.yaml')
      expect(lockfile).not.toContain('@acme/private-utils')
      expect(lockfile).toContain('ms@2.1.3')

      const files = await listTarFiles(codeBundlePath)
      expect(files).toContain('.checkly/embedded-packages/ms@2.1.3.tgz')
      expect(files).not.toContain('.checkly/embedded-packages/@acme+private-utils@1.2.3.tgz')

      // A successful prune-and-embed produces no user-facing prune output;
      // progress is debug-only for now.
      expect(output.stderr).not.toContain('could not prune the bundled lockfile')
      expect(output.stderr).not.toContain('the bundled lockfile was not pruned')

      // The cache hash reflects exactly what ships: the kept-only embedded
      // set, the faux manifest and the pruned lockfile.
      const shimmedManifest = await readTarEntryContent(codeBundlePath, 'packages/shimmed/package.json')
      const workspace = await new PNpmDetector().lookupWorkspace(fixt.root)
      const expectedHash = composeWorkspaceCacheHash(await loadWorkspaceCacheHashInputs(workspace!), {
        embeddedPackages: [
          { name: 'ms', version: '2.1.3', integrity: MS_INTEGRITY },
        ],
        fauxPackageJsons: [
          { path: 'packages/shimmed/package.json', raw: Buffer.from(shimmedManifest, 'utf8') },
        ],
        prunedLockfile: {
          name: 'pnpm-lock.yaml',
          hash: createHash('sha256').update(lockfile).digest(),
        },
      })
      expect(cacheHash).toEqual(expectedHash)
    }, DEFAULT_TEST_TIMEOUT)

    // The CHECKLY_LOCKFILE_PRUNE=0 direction (full planned set ships, full-set
    // hash) is covered hermetically in bundler.spec.ts — with pruning off no
    // pnpm interaction is involved, so a sandbox run would add nothing.
  })

  describe('bundling with testDir through a symlink', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-linked-testdir'),
      })

      // The config's testDir and globalSetup both run through this link.
      await fs.symlink(
        path.join('shared', 'tests'),
        path.join(fixt.root, 'linked-tests'),
        'dir',
      )
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should bundle content at real paths and carry the link the config spells its paths through', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const entries = await listTarEntries(codeBundlePath)
      expectNoSymlinkHasChildren(entries)

      const files = entries.filter(entry => entry.type !== 'SymbolicLink').map(entry => entry.path)
      const symlinks = entries
        .filter(entry => entry.type === 'SymbolicLink')
        .map(entry => `${entry.path} -> ${entry.linkpath}`)

      // Content lives at its real paths — never at the through-link spelling,
      // which under a kept link would be the symlink-with-children shape tar
      // cannot extract.
      expect(files).toEqual(expect.arrayContaining([
        'shared/tests/example.spec.ts',
        'shared/tests/setup.ts',
        'playwright.config.ts',
      ]))
      expect(files.filter(file => file.startsWith('linked-tests/'))).toEqual([])

      // The archived config still says './linked-tests', so the link must
      // travel with the bundle for that spelling to resolve on the runner.
      expect(symlinks).toEqual([
        'linked-tests -> shared/tests',
      ])
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling with subdirectory playwright config', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-subdir-include'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should resolve include patterns relative to the playwright config directory', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('subdir/fixtures/data.json')
      expect(files).not.toContain('fixtures/decoy.json')
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling with pnpm patches auto-include', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-pnpm-patches'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should auto-include patches directory for pnpm projects', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('patches/some-package+1.0.0.patch')
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling with pnpm patches auto-include and subdirectory playwright config', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-subdir-pnpm-patches'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should auto-include patches from project root when playwright config is in a subdirectory', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('patches/some-package+1.0.0.patch')
    }, DEFAULT_TEST_TIMEOUT)
  })

  /**
   * Creates a temp CLI cache dir seeded with committed tarball fixtures so
   * that embedded-packages tests run offline: with CHECKLY_CACHE_DIR set to
   * the returned dir, the materializer finds every tarball in the CLI cache
   * and never contacts a registry.
   */
  async function seedTarballCache (...tarballFilenames: string[]): Promise<string> {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-embed-cache-'))
    const cache = TarballCache.default({ CHECKLY_CACHE_DIR: cacheDir })
    for (const filename of tarballFilenames) {
      const content = await fs.readFile(
        path.join(__dirname, 'fixtures', 'playwright-check', 'embedded-tarballs', filename),
      )
      const integrity = `sha512-${createHash('sha512').update(content).digest('base64')}`
      await cache.put(integrity, content)
    }
    return cacheDir
  }

  describe('bundling with embedded packages', () => {
    let fixt: FixtureSandbox
    let cacheDir: string

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-embedded-packages'),
      })
      cacheDir = await seedTarballCache('@acme+private-utils@1.2.3.tgz', 'legacy-private-pkg@2.1.0.tgz')
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
      if (cacheDir) {
        await fs.rm(cacheDir, { recursive: true, force: true })
      }
    })

    it('should embed configured tarballs at the contract path', async () => {
      const output = await parseProjectWithOptions(fixt, { env: { CHECKLY_CACHE_DIR: cacheDir } })

      expect(output.diagnostics.fatal).toBe(false)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('.checkly/embedded-packages/@acme+private-utils@1.2.3.tgz')
      expect(files).toContain('.checkly/embedded-packages/legacy-private-pkg@2.1.0.tgz')
      // The lockfile also contains legacy-private-pkg@3.0.0; the exact
      // version pin must exclude it.
      expect(files).not.toContain('.checkly/embedded-packages/legacy-private-pkg@3.0.0.tgz')
    }, DEFAULT_TEST_TIMEOUT)

    it('should change the payload cacheHash when the embed list changes', async () => {
      const cacheHashFor = async (...args: string[]): Promise<string> => {
        const output = await parseProjectWithOptions(fixt, { env: { CHECKLY_CACHE_DIR: cacheDir } }, ...args)
        expect(output.diagnostics.fatal).toBe(false)
        const cacheHash = (output.payload.resources[0].payload as any).cacheHash
        expect(cacheHash).toMatch(/^[0-9a-f]{64}$/)
        return cacheHash
      }

      const bothPackages = await cacheHashFor()
      const onePackage = await cacheHashFor('--config', 'checkly.one-package.config.ts')

      expect(onePackage).not.toBe(bothPackages)
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling with embedded packages and subdirectory playwright config', () => {
    let fixt: FixtureSandbox
    let cacheDir: string

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-embedded-packages-subdir'),
      })
      cacheDir = await seedTarballCache('@acme+private-utils@1.2.3.tgz')
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
      if (cacheDir) {
        await fs.rm(cacheDir, { recursive: true, force: true })
      }
    })

    it('should embed tarballs at the contract path when playwright config is in a subdirectory', async () => {
      const output = await parseProjectWithOptions(fixt, { env: { CHECKLY_CACHE_DIR: cacheDir } })

      expect(output.diagnostics.fatal).toBe(false)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('.checkly/embedded-packages/@acme+private-utils@1.2.3.tgz')
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('embedded packages validation', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-embedded-packages-not-found'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should fail validation for a package that is not in the lockfile', async () => {
      const output = await parseProject(fixt)

      expect(output.diagnostics.fatal).toBe(true)
      expect(output.payload).toBeNull()

      const observation = output.diagnostics.observations.find(obs => obs.message.includes('no-such-package'))
      expect(observation).toBeDefined()
      expect(observation?.fatal).toBe(true)
      expect(observation?.message).toContain('does not match any package in the lockfile')
    }, DEFAULT_TEST_TIMEOUT)
  })

  describe('bundling with absolute include path', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'fixtures', 'playwright-check', 'test-cases', 'test-bundling-absolute-include'),
      })
    }, DEFAULT_TEST_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should include files specified via absolute path in include', async () => {
      const output = await parseProject(fixt)

      const {
        codeBundlePath,
      } = output.payload.resources[0].payload as any

      const files = await listTarFiles(codeBundlePath)

      expect(files).toContain('fixtures/data.json')
    }, DEFAULT_TEST_TIMEOUT)
  })
})
