import { describe, it, expect } from 'vitest'

import { FileMeta, SourceFile } from '../source-file.js'
import { JsonTextSourceFile } from '../json-text-source-file.js'

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
  it('should load a JSON text file', async () => {
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

  it('should load a plain JSON file', async () => {
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

  it('should not load an invalid JSON text file', async () => {
    const sourceFile = new SourceFile(
      FileMeta.fromFilePath('foo.json'),
      '{ "foo": "bar" "baz": 1 }',
    )

    await expect(JsonTextSourceFile.loadFromSourceFile(sourceFile)).resolves.toBeUndefined()
  })
})
