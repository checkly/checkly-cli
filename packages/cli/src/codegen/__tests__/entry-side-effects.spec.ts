import { afterEach, describe, expect, it, vi } from 'vitest'

// A program that renders code without running the CLI (a server, say) imports
// this entry, so loading it, and generating with it, must leave the
// process's configuration and credentials alone.
describe('the checkly/codegen entry', () => {
  const realEnv = process.env

  afterEach(() => {
    process.env = realEnv
    vi.doUnmock('axios')
    vi.doUnmock('conf')
    vi.resetModules()
  })

  it('creates no HTTP client, opens no config store and reads no CHECKLY_ variable', async () => {
    vi.resetModules()

    const createClient = vi.fn()
    vi.doMock('axios', async importOriginal => {
      const actual = await importOriginal<typeof import('axios')>()
      createClient.mockImplementation(actual.default.create)
      return { ...actual, default: { ...actual.default, create: createClient } }
    })
    // A store that holds nothing, so that a regression fails the assertions
    // below rather than the import.
    const openStore = vi.fn(function () {
      return { get: () => undefined }
    })
    vi.doMock('conf', () => ({ default: openStore }))

    const reads: string[] = []
    process.env = new Proxy(realEnv, {
      get (target, name) {
        if (typeof name === 'string' && name.startsWith('CHECKLY_')) {
          reads.push(name)
        }
        return Reflect.get(target, name)
      },
      has (target, name) {
        if (typeof name === 'string' && name.startsWith('CHECKLY_')) {
          reads.push(name)
        }
        return Reflect.has(target, name)
      },
    })

    const { generateConstructDiff, generateConstructFiles } = await import('../index.js')
    const { files, failures } = generateConstructFiles({
      resources: [{
        type: 'check',
        logicalId: 'homepage',
        payload: {
          id: 'homepage',
          checkType: 'URL',
          name: 'Homepage',
          frequency: 10,
          request: { url: 'https://www.example.com' },
        },
      }],
    })

    expect(failures).toEqual([])
    expect(files.map(file => file.path)).toEqual(['resources/url-monitors/homepage.check.ts'])

    const lines = generateConstructDiff({
      resource: {
        type: 'check',
        logicalId: 'homepage',
        payload: {
          id: 'homepage',
          checkType: 'URL',
          name: 'Homepage',
          frequency: 10,
          request: { url: 'https://www.example.com' },
        },
      },
      deployed: { checkType: 'URL', name: 'Old homepage', frequency: 10, request: { url: 'https://www.example.com' } },
      changes: [{ path: '/name', before: 'Old homepage', after: 'Homepage' }],
      redactions: [],
    })
    expect(lines).toContainEqual({ kind: 'add', text: '  name: \'Homepage\',' })
    expect(createClient).not.toHaveBeenCalled()
    expect(openStore).not.toHaveBeenCalled()
    expect(reads).toEqual([])
  })
})
