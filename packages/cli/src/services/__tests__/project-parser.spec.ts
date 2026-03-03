import path from 'node:path'

import { v4 as uuidv4 } from 'uuid'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

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

const DEFAULT_FIXT_TIMEOUT = 180_000

describe('parseProject()', () => {
  describe('simple-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'simple-project'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should parse a simple project', async () => {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          project: expect.objectContaining({
            logicalId: 'project-id',
            name: 'project name',
            repoUrl: 'https://github.com/checkly/checkly-cli',
          }),
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'check',
              logicalId: 'browser-check-1',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: 'browser-check-2',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: 'api-check-1',
            }),
          ]),
        }),
      }))
      expect(output.payload.resources).toHaveLength(3)
    })
  })

  describe('simple-project-with-pl', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'simple-project-with-pl'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should parse a simple project with private-locations', async () => {
      const privateLocationId = uuidv4()

      const output = await parseProject(
        fixt,
        '--inject-private-location',
        `${privateLocationId}:my-external-private-location`,
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          project: expect.objectContaining({
            logicalId: 'project-id',
            name: 'project name',
            repoUrl: 'https://github.com/checkly/checkly-cli',
          }),
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'check-group',
              logicalId: 'group-1',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: 'browser-check-1',
            }),
            expect.objectContaining({
              type: 'private-location',
              logicalId: 'private-location-1',
              member: true,
            }),
            expect.objectContaining({
              type: 'private-location',
              logicalId: `private-location-${privateLocationId}`,
              member: false,
            }),
            expect.objectContaining({
              type: 'private-location-check-assignment',
              logicalId: 'private-location-check-assignment#browser-check-1#private-location-1',
            }),
            expect.objectContaining({
              type: 'private-location-check-assignment',
              logicalId: `private-location-check-assignment#browser-check-1#private-location-${privateLocationId}`,
            }),
            expect.objectContaining({
              type: 'private-location-group-assignment',
              logicalId: 'private-location-group-assignment#group-1#private-location-1',
            }),
            expect.objectContaining({
              type: 'private-location-group-assignment',
              logicalId: `private-location-group-assignment#group-1#private-location-${privateLocationId}`,
            }),
          ]),
        }),
      }))
      expect(output.payload.resources).toHaveLength(8)
    })
  })

  describe('typescript-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'typescript-project'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should parse a project with TypeScript check files', async () => {
      const output = await parseProject(
        fixt,
        '--inject-private-location',
        '70c4ded4-2229-45a7-acf4-6b1eb56a86df:my-external-private-location',
      )

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          project: expect.objectContaining({
            logicalId: 'ts-project-id',
            name: 'ts project',
            repoUrl: 'https://github.com/checkly/checkly-cli',
          }),
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'check',
              logicalId: 'ts-check',
            }),
          ]),
        }),
      }))
      expect(output.payload.resources).toHaveLength(1)
    })
  })

  describe('multiple-glob-patterns-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'multiple-glob-patterns-project'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should parse a project with multiple glob patterns and deduplicate overlapping patterns', async () => {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          project: expect.objectContaining({
            logicalId: 'glob-project-id',
            name: 'glob project',
            repoUrl: 'https://github.com/checkly/checkly-cli',
          }),
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'check',
              logicalId: 'nested',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: 'check1',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: 'check2',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: '__checks1__/__nested-checks__/nested.spec.js',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: '__checks1__/check1.spec.js',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: '__checks2__/check2.spec.js',
            }),
          ]),
        }),
      }))
      expect(output.payload.resources).toHaveLength(6)
    })
  })

  describe('empty-script-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'empty-script-project'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should report error diagnostics for empty browser-check script on validation', async () => {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: true,
          observations: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining(' must not be empty.'),
            }),
          ]),
        }),
      }))
    })
  })

  describe('empty-env-project', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'empty-env-project'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should report error diagnostics for empty environment variable on validate', async () => {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: true,
          observations: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('Reason: Value must not be empty.'),
            }),
          ]),
        }),
      }))
    })
  })

  describe('multistep-browser-glob-patterns', () => {
    let fixt: FixtureSandbox

    beforeAll(async () => {
      fixt = await FixtureSandbox.create({
        source: path.join(__dirname, 'project-parser-fixtures', 'multistep-browser-glob-patterns'),
      })
    }, DEFAULT_FIXT_TIMEOUT)

    afterAll(async () => {
      await fixt?.destroy()
    })

    it('should parse a project with multistep & browser glob patterns', async () => {
      const output = await parseProject(fixt)

      expect(output).toEqual(expect.objectContaining({
        diagnostics: expect.objectContaining({
          fatal: false,
        }),
        payload: expect.objectContaining({
          project: expect.objectContaining({
            logicalId: 'glob-project-id',
            name: 'glob project',
            repoUrl: 'https://github.com/checkly/checkly-cli',
          }),
          resources: expect.arrayContaining([
            expect.objectContaining({
              type: 'check',
              logicalId: '__checks__/browser/check2.spec.js',
            }),
            expect.objectContaining({
              type: 'check',
              logicalId: '__checks__/multistep/check1.spec.js',
            }),
          ]),
        }),
      }))
      expect(output.payload.resources).toHaveLength(2)
    })
  })
})
