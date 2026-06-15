import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const referencesDir = join(dirname(fileURLToPath(import.meta.url)), '../references')

function readReference (name: string): Promise<string> {
  return readFile(join(referencesDir, name), 'utf8')
}

function normalizeLineEndings (content: string): string {
  return content.replace(/\r\n/g, '\n')
}

describe('AI context investigation references', () => {
  it('points test-session asset retrieval at the assets commands', async () => {
    const content = normalizeLineEndings(await readReference('investigate-test-sessions.md'))

    expect(content).toContain('npx checkly assets list --test-session-id <test-session-id> --result-id <test-session-result-id>')
    expect(content).toContain('npx checkly assets download --test-session-id <test-session-id> --result-id <test-session-result-id> --asset "<Asset>"')
    expect(content).toContain('The default table output\nhas an `Asset` column; copy that value into `--asset` for single-file downloads.')
    expect(content).toContain('"pagination": {\n    "length": 0\n  }')
    expect(content).not.toContain('There is no dedicated `test-sessions download` command')
    expect(content).not.toContain('download those URLs directly')
  })

  it('documents check result attempts and asset retrieval', async () => {
    const content = normalizeLineEndings(await readReference('investigate-checks.md'))

    expect(content).toContain('npx checkly checks get <check-id> --result <result-id> --include-attempts --output json')
    expect(content).toContain('"result": {}')
    expect(content).toContain('"attempts": []')
    expect(content).toContain('npx checkly assets list --check-id <check-id> --result-id <result-id>')
    expect(content).toContain('npx checkly assets download --check-id <check-id> --result-id <result-id> --asset "<Asset>"')
    expect(content).toContain('The default table output\nhas an `Asset` column; copy that value into `--asset` for single-file downloads.')
  })
})
