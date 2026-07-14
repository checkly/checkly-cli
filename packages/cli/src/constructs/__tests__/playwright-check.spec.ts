import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { list } from 'tar'

import { FixtureSandbox } from '../../testing/fixture-sandbox.js'
import { ParseProjectOutput } from '../../commands/debug/parse-project.js'

async function parseProject (fixt: FixtureSandbox, ...args: string[]): Promise<ParseProjectOutput> {
  const result = await fixt.run('pnpm', [
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
      const output = await parseProject(
        fixt,
        '--config',
        'checkly.include-node-modules-if-explicit.config.ts',
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

      expect(files.sort()).toEqual(expect.arrayContaining([
        'node_modules/checkly/package.json',
        'package.json',
        'playwright.config.ts',
        'pnpm-lock.yaml',
        'tests/example.spec.ts',
      ]))

      // The package list stays permissive because the checkly package's own
      // contents change, but the archive still has to be extractable — and
      // `node_modules/checkly` is a pnpm symlink, so this is exactly where a
      // symlink entry used to appear with files nested beneath it.
      expectNoSymlinkHasChildren(entries)
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

      const symlink = async (relativePath: string, target: string) => {
        const linkPath = path.join(nodeModules, relativePath)
        await fs.mkdir(path.dirname(linkPath), { recursive: true })
        await fs.symlink(target, linkPath)
      }

      // What pnpm builds: packages live in a store, and node_modules holds links
      // into it. A package's own dependencies sit next to it inside the store,
      // not underneath it.
      await writeFile('.pnpm/pkg@1.0.0/node_modules/pkg/index.js', 'module.exports = require(\'dep\')\n')
      await writeFile('.pnpm/pkg@1.0.0/node_modules/pkg/package.json', '{"name":"pkg","version":"1.0.0"}')
      await symlink('.pnpm/pkg@1.0.0/node_modules/dep', '../../dep@2.0.0/node_modules/dep')
      await writeFile('.pnpm/dep@2.0.0/node_modules/dep/index.js', 'module.exports = \'dep\'\n')
      await writeFile('.pnpm/dep@2.0.0/node_modules/dep/package.json', '{"name":"dep","version":"2.0.0"}')
      await symlink('pkg', '.pnpm/pkg@1.0.0/node_modules/pkg')

      // A linked workspace package, which is how a monorepo shares code.
      await symlink('@scope/shared-lib', '../../../shared-lib')

      // A symlinked source directory that a spec imports through. The check
      // parser registers what the spec imports at its path *through* the link,
      // without resolving it — so its files arrive beneath a link the symlink
      // resolver kept, from a code path the resolver never sees.
      await fs.symlink('../shared-helpers', path.join(fixt.root, 'packages', 'e2e', 'helpers'))
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
