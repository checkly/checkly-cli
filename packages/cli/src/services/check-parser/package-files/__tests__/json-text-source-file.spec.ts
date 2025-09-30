import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

import { FileMeta, SourceFile } from '../source-file'
import { JsonTextSourceFile } from '../json-text-source-file'

const plainJsonFixture = ''
  + `{\n`
  + `  "foo": "bar",\n`
  + `  "trailing-comma": "no"\n`
  + `}\n`

const jsonTextFixture = ''
  + `{\n`
  + `  "foo": "bar", // Foo bar.\n`
  + `  "trailing-comma": "yes",\n`
  + `}\n`

describe('JsonTextSourceFile', () => {
  describe('when typescript is NOT available', () => {
    beforeAll(() => {
      JsonTextSourceFile.reset()
    })

    beforeAll(() => {
      vi.doMock('typescript', () => {
        class ModuleNotFoundError extends Error {
          code = 'MODULE_NOT_FOUND'

          constructor (moduleName: string) {
            super(`Cannot find module '${moduleName}'`)
          }
        }

        throw new ModuleNotFoundError('typescript')
      })
    })

    afterAll(() => {
      vi.doUnmock('typescript')
    })

    it('should fail to load a JSON text file', async () => {
      const sourceFile = new SourceFile(
        FileMeta.fromFilePath('foo.json'),
        jsonTextFixture,
      )

      await expect(JsonTextSourceFile.loadFromSourceFile(sourceFile)).resolves.toBeUndefined()
    })

    it('should successfully load a plain JSON file', async () => {
      const sourceFile = new SourceFile(
        FileMeta.fromFilePath('foo.json'),
        plainJsonFixture,
      )

      await expect(JsonTextSourceFile.loadFromSourceFile(sourceFile)).resolves.toEqual(
        expect.objectContaining({
          data: {
            'foo': 'bar',
            'trailing-comma': 'no',
          },
        }),
      )
    })
  })

  describe('when typescript is available', () => {
    beforeAll(() => {
      JsonTextSourceFile.reset()
    })

    it('should successfully load a JSON text file', async () => {
      const sourceFile = new SourceFile(
        FileMeta.fromFilePath('foo.json'),
        jsonTextFixture,
      )

      await expect(JsonTextSourceFile.loadFromSourceFile(sourceFile)).resolves.toEqual(
        expect.objectContaining({
          data: {
            'foo': 'bar',
            'trailing-comma': 'yes',
          },
        }),
      )
    })

    it('should successfully load a plain JSON file', async () => {
      const sourceFile = new SourceFile(
        FileMeta.fromFilePath('foo.json'),
        plainJsonFixture,
      )

      await expect(JsonTextSourceFile.loadFromSourceFile(sourceFile)).resolves.toEqual(
        expect.objectContaining({
          data: {
            'foo': 'bar',
            'trailing-comma': 'no',
          },
        }),
      )
    })
  })
})
