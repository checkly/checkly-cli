import { describe, it, expect } from 'vitest'
import { resolveEngineVersion } from '../engine-resolver.js'

describe('resolveEngineVersion', () => {
  describe('node', () => {
    it('should allow Node 22', async () => {
      const res = await resolveEngineVersion('22', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('22')
      expect(res.notices).toHaveLength(0)
    })

    it('should allow Node 24', async () => {
      const res = await resolveEngineVersion('24', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('24')
      expect(res.notices).toHaveLength(0)
    })

    it('should allow Node 26', async () => {
      const res = await resolveEngineVersion('26', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('26')
      expect(res.notices).toHaveLength(0)
    })

    it('should remap Node 18 to 22 with notice', async () => {
      const res = await resolveEngineVersion('18', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('22')
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('Node.js 18')
    })

    it('should remap Node 20 to 22 with notice', async () => {
      const res = await resolveEngineVersion('20', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('22')
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('Node.js 20')
    })

    it('should remap Node 21 to 22 with notice', async () => {
      const res = await resolveEngineVersion('21', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('22')
      expect(res.notices).toHaveLength(1)
    })

    it('should remap Node 23 to 24 with notice', async () => {
      const res = await resolveEngineVersion('23', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('24')
      expect(res.notices).toHaveLength(1)
    })

    it('should remap Node 25 to 26 with notice', async () => {
      const res = await resolveEngineVersion('25', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('26')
      expect(res.notices).toHaveLength(1)
    })

    it('should remap Node 27+ to 26 with notice', async () => {
      const res = await resolveEngineVersion('27', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('26')
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('27')
    })

    it('should remap Node 16 to 22 with notice', async () => {
      const res = await resolveEngineVersion('16', 'node')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('22')
      expect(res.notices).toHaveLength(1)
      expect(res.notices[0]).toContain('16')
    })
  })

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

    it('should remap Bun 1.4 to 1.3 with notice', async () => {
      const res = await resolveEngineVersion('1.4', 'bun')
      expect(res.denied).toBe(false)
      expect(res.version).toBe('1.3')
      expect(res.notices).toHaveLength(1)
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
