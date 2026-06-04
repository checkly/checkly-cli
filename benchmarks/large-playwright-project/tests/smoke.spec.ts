import { test, expect } from '@playwright/test'

import { Logger, ok, unwrap } from '../src/lib'

test('logger and result helpers work', async () => {
  const logger = new Logger('smoke', 'debug')
  logger.info('running smoke test')
  expect(unwrap(ok(42))).toBe(42)
})
