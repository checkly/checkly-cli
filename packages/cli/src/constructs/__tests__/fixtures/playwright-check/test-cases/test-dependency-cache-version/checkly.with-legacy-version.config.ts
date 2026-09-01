// Same version value as checkly.with-version.config.ts, but set via the
// deprecated caching.dependencyCache.version location — the resulting
// cacheHash must be identical to the one produced by the current
// runner.cache.install.version location.
import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
  },
  caching: {
    dependencyCache: {
      version: 'v2',
    },
  },
})

export default config
