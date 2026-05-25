import { describe, it, expect } from 'vitest'
import { parseFields } from '../api-fields.js'

describe('parseFields', () => {
  it('parses raw string fields', () => {
    expect(parseFields(['name=MyCheck', 'tag=prod'], [])).toEqual({
      name: 'MyCheck',
      tag: 'prod',
    })
  })

  it('parses typed string fields with =', () => {
    expect(parseFields([], ['name=MyCheck'])).toEqual({ name: 'MyCheck' })
  })

  it('parses typed JSON fields with :=', () => {
    expect(parseFields([], ['activated:=true', 'count:=42', 'tags:=["a","b"]'])).toEqual({
      activated: true,
      count: 42,
      tags: ['a', 'b'],
    })
  })

  it('handles values containing = sign', () => {
    expect(parseFields(['url=https://example.com?a=1'], [])).toEqual({
      url: 'https://example.com?a=1',
    })
  })

  it('handles empty string values', () => {
    expect(parseFields(['key='], [])).toEqual({ key: '' })
  })

  it('merges raw and typed fields', () => {
    expect(parseFields(['name=Test'], ['activated:=true'])).toEqual({
      name: 'Test',
      activated: true,
    })
  })

  it('typed fields override raw fields with same key', () => {
    expect(parseFields(['name=Old'], ['name=New'])).toEqual({ name: 'New' })
  })

  it('throws on raw field without =', () => {
    expect(() => parseFields(['broken'], [])).toThrow('Invalid field format: "broken"')
  })

  it('throws on typed field without = or :=', () => {
    expect(() => parseFields([], ['broken'])).toThrow('Invalid field format: "broken"')
  })

  it('throws on invalid JSON in := field', () => {
    expect(() => parseFields([], ['data:={not json}'])).toThrow('Invalid JSON in field "data"')
  })

  it('handles object JSON values', () => {
    expect(parseFields([], ['config:={"key":"val"}'])).toEqual({
      config: { key: 'val' },
    })
  })
})
