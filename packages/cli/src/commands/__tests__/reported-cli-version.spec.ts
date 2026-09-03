import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveReportedCliVersion } from '../baseCommand.js'

// A release-style version keeps the resolver away from the npm registry
// fallback, which only triggers for development builds.
const configVersion = '9.0.0'

// The e2e harness exports CHECKLY_E2E_CLI_VERSION, so a developer's shell may
// have it set; the "unset" cases clear it explicitly instead of assuming.

describe('resolveReportedCliVersion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports the package version by default', async () => {
    vi.stubEnv('CHECKLY_E2E_CLI_VERSION', undefined)
    await expect(resolveReportedCliVersion(configVersion)).resolves.toBe(configVersion)
  })

  it('lets CHECKLY_E2E_CLI_VERSION override the reported version', async () => {
    vi.stubEnv('CHECKLY_E2E_CLI_VERSION', '4.8.0')
    await expect(resolveReportedCliVersion(configVersion)).resolves.toBe('4.8.0')
  })

  it('ignores the former CHECKLY_CLI_VERSION variable', async () => {
    vi.stubEnv('CHECKLY_E2E_CLI_VERSION', undefined)
    vi.stubEnv('CHECKLY_CLI_VERSION', 'latest')
    await expect(resolveReportedCliVersion(configVersion)).resolves.toBe(configVersion)
  })
})
