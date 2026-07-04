import { describe, expect, it, vi } from 'vitest'
import Resources from '../resources.js'

describe('Resources REST client', () => {
  it('exports resources through the public code export endpoint', async () => {
    const response = {
      files: [{ path: 'resources/api-checks/example.check.ts', content: 'construct\n' }],
    }
    const api = {
      post: vi.fn().mockResolvedValue({ data: response }),
    }
    const resources = new Resources(api as any)
    const payload = {
      resources: [{ type: 'check' as const, id: 'check-id' }],
    }

    await expect(resources.exportCode(payload)).resolves.toEqual(response)

    expect(api.post).toHaveBeenCalledWith('/v1/resources/code-export', payload)
  })
})
