import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const aiContextDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// Only the labelled markers. A bare `=======` line is also a legal setext
// heading underline, so flagging it would fail this suite on a valid file.
const MARKER = /^(<{7}|>{7})( |$)/m

describe('AI context sources', () => {
  it('ships no unresolved merge conflict markers', async () => {
    // Everything here is copied into dist verbatim and then either served
    // to users by the skills command or written into scaffolded projects,
    // and the parts most likely to carry a bad merge are parsed by nothing
    // that would notice: markdown by no tool at all, and
    // onboarding-boilerplate by neither tsc (tsconfig.json excludes the
    // directory) nor vitest (vitest.config.mts excludes it), with its
    // `__checks__` specs also outside eslint's reach. A botched resolution
    // there ships to users with every other check still green.
    //
    // Negative control first: a matcher that stopped matching would leave
    // this suite green with a real marker in the tree, which is the whole
    // failure this guard exists to prevent.
    expect('<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> theirs\n').toMatch(MARKER)
    expect('# A heading\n=======\n\nnormal text\n').not.toMatch(MARKER)

    const entries = await readdir(aiContextDir, { recursive: true, withFileTypes: true })
    const files = entries
      .filter(entry => entry.isFile())
      .map(entry => join(entry.parentPath, entry.name))
      // Tests are not shipped, and this file holds a marker on purpose:
      // scanning it would make the guard's own fixture trip it.
      .filter(file => !file.includes(`${sep}__tests__${sep}`))
    // Guard the guard: a directory walk that silently finds nothing would
    // pass forever.
    expect(files.length).toBeGreaterThan(20)

    for (const file of files) {
      const content = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n')
      expect(content, `${file} contains a merge conflict marker`)
        .not.toMatch(MARKER)
    }
  })
})
