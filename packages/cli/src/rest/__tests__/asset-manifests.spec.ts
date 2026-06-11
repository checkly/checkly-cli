import { describe, expect, it, vi } from 'vitest'
import AssetManifests from '../asset-manifests.js'

describe('AssetManifests REST client', () => {
  it('gets a check result asset manifest', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { assets: [] } }),
    }
    const assetManifests = new AssetManifests(api as any)

    const result = await assetManifests.getForCheckResult('check-id', 'result-id')

    expect(result).toEqual({ assets: [] })
    expect(api.get).toHaveBeenCalledWith('/v1/check-results/check-id/result-id/assets')
  })

  it('gets a filtered check result asset manifest', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { assets: [] } }),
    }
    const assetManifests = new AssetManifests(api as any)

    const result = await assetManifests.getForCheckResult('check-id', 'result-id', {
      type: 'trace',
      name: 'test-results/**/trace.zip',
    })

    expect(result).toEqual({ assets: [] })
    expect(api.get).toHaveBeenCalledWith('/v1/check-results/check-id/result-id/assets', {
      params: {
        type: 'trace',
        name: 'test-results/**/trace.zip',
      },
    })
  })

  it('gets a test-session result asset manifest', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { assets: [] } }),
    }
    const assetManifests = new AssetManifests(api as any)

    const result = await assetManifests.getForTestSessionResult('session-id', 'result-id')

    expect(result).toEqual({ assets: [] })
    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id/results/result-id/assets')
  })

  it('gets a filtered test-session result asset manifest', async () => {
    const api = {
      get: vi.fn().mockResolvedValue({ data: { assets: [] } }),
    }
    const assetManifests = new AssetManifests(api as any)

    const result = await assetManifests.getForTestSessionResult('session-id', 'result-id', {
      type: 'screenshot',
      name: '*.png',
    })

    expect(result).toEqual({ assets: [] })
    expect(api.get).toHaveBeenCalledWith('/v1/test-sessions/session-id/results/result-id/assets', {
      params: {
        type: 'screenshot',
        name: '*.png',
      },
    })
  })
})
