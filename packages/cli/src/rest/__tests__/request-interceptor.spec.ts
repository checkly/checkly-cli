import { describe, it, expect, vi, beforeEach } from 'vitest'

// api.ts builds its axios instance and resource classes at import time via
// getDefaults(); stub the config service so importing it needs no credentials.
vi.mock('../../services/config.js', () => ({
  default: {
    getApiKey: () => 'test-key',
    getAccountId: () => 'test-account',
    getApiUrl: () => 'https://api.checklyhq.com',
    hasValidCredentials: () => true,
  },
}))

vi.mock('../../helpers/cli-mode.js', () => ({
  detectCliMode: vi.fn(() => 'interactive'),
  detectOperator: vi.fn(() => 'manual'),
}))

import { requestInterceptor } from '../api.js'
import { detectCliMode } from '../../helpers/cli-mode.js'

describe('requestInterceptor x-checkly-source', () => {
  const sourceHeader = () => {
    const config = { headers: {} } as any
    return requestInterceptor(config).headers['x-checkly-source']
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports AGENT when the CLI is driven by an agent', () => {
    vi.mocked(detectCliMode).mockReturnValue('agent')
    expect(sourceHeader()).toBe('AGENT')
  })

  it('reports CLI for interactive and CI runs', () => {
    vi.mocked(detectCliMode).mockReturnValue('interactive')
    expect(sourceHeader()).toBe('CLI')

    vi.mocked(detectCliMode).mockReturnValue('ci')
    expect(sourceHeader()).toBe('CLI')
  })
})
