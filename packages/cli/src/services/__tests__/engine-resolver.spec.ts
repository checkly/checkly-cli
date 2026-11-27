import { describe, it, expect } from 'vitest'
import { resolveEngineVersion } from '../engine-resolver.js'

describe('resolveEngineVersion', () => {
  describe('bun', () => {
    it('should allow Bun 1.3', async () => {
      const res = await resolveEngineVersion('1.3', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1.3')
      expect(res.notices).toHaveLength(0)
    })

    it('should remap Bun 1.2 to 1.3 with notice', async () => {
      const res = await resolveEngineVersion('1.2', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1.3')
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('1.2')
    })

    it('should allow Bun 1.4', async () => {
      const res = await resolveEngineVersion('1.4', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1.4')
      expect(res.notices).toHaveLength(0)
    })

    it('should reduce a Bun 1.4 patch version to 1.4', async () => {
      const res = await resolveEngineVersion('1.4.2', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1.4')
      expect(res.notices).toHaveLength(0)
    })

    it('should keep Bun 1 (latest available 1.x) as written', async () => {
      const res = await resolveEngineVersion('1', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1')
      expect(res.notices).toHaveLength(0)
    })

    it('should remap a not-yet-available Bun 1.x minor to 1.4 with notice', async () => {
      for (const version of ['1.5', '1.10']) {
        const res = await resolveEngineVersion(version, 'bun')
        expect(res.denied).toBe(false)
        expect(res.version).toBe('1.4')
        expect(res.notices).toHaveLength(1)
        expect(res.notices[0]).toContain(version)
      }
    })

    it('should fall back to the latest available Bun 1.x for an uncoercible version', async () => {
      const res = await resolveEngineVersion('latest', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1')
    })

    it('should deny Bun 2.0', async () => {
      const res = await resolveEngineVersion('2.0', 'bun')
      expect(res.denied).toBe(true)
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('2.0')
    })

    it('should deny Bun 3.0', async () => {
      const res = await resolveEngineVersion('3.0', 'bun')
      expect(res.denied).toBe(true)
      expect(res.notices).toHaveLength(1)
    })
  })
})
