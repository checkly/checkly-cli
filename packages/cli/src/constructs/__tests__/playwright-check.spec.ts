import path from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { list } from 'tar'

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

async function listTarFiles (filePath: string): Promise<string[]> {
  const filenames: string[] = []
  await list({
    file: filePath,
    onReadEntry: entry => filenames.push(entry.path),
  })
  return filenames
}

const DEFAULT_TEST_TIMEOUT = 30_000

describe('PlaywrightCheck', () => {
  it('should synthesize groupName', async () => {
    const fixt = await FixtureSandbox.create({
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

    describe('headless', () => {
      it('should error if headless: false is set globally', async () => {
        const fixt = await FixtureSandbox.create({
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
      })
    })

    describe('installCommand', () => {
      it('should warn when installCommand contains playwright install', async () => {
        const fixt = await FixtureSandbox.create({
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
      })

      it('should not warn when testCommand does not playwright install', async () => {
        const fixt = await FixtureSandbox.create({
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
      })
    })
  })

  describe('defaults', () => {
    it('should ignore retryStrategy from session check defaults', async () => {
      const fixt = await FixtureSandbox.create({
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
      await fixt.destroy()
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
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
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
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
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

      const files = await listTarFiles(codeBundlePath)

      expect(files.sort()).toEqual(expect.arrayContaining([
        'node_modules/checkly/package.json',
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
        'tests/example.spec.ts',
      ]))
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
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
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
        'package-lock.json',
        'package.json',
        'playwright.config.ts',
        'tests/example.spec.ts',
      ])
    }, DEFAULT_TEST_TIMEOUT)
  })
})
