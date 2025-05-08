import { describe, it, expect } from 'vitest'

import { cased } from "../case"

describe('cased', () => {
  it('kebab-case: should produce a properly cased ASCII string', () => {
    const tests = [
      ['fooBar', 'foo-bar'],
      ['fooBar9', 'foo-bar9'],
      ['foo4Bar9', 'foo4-bar9'],
      ['foo458Bar948', 'foo458-bar948'],
      ['48bar', '48bar'],
      ['foobar', 'foobar'],
      ['foo bar', 'foo-bar'],
      ['foo  bar', 'foo-bar'],
      ['foo#bar', 'foo-bar'],
      ['foo$bar', 'foo-bar'],
      ['foo-bar', 'foo-bar'],
      ['foo_bar', 'foo-bar'],
      ['foo!@#$%^&*()-bar', 'foo-bar'],
      ['fooBAR', 'foo-bar'],
      ['foo1BB2AA3RR', 'foo1-bb2-aa3-rr'],
    ]

    for (const [have, want] of tests) {
      const got = cased(have, 'kebab-case')
      expect(got).toEqual(want)
    }
  })

  it('snake_case: should produce a properly cased ASCII string', () => {
    const tests = [
      ['fooBar', 'foo_bar'],
      ['fooBar9', 'foo_bar9'],
      ['foo4Bar9', 'foo4_bar9'],
      ['foo458Bar948', 'foo458_bar948'],
      ['48bar', '48bar'],
      ['foobar', 'foobar'],
      ['foo bar', 'foo_bar'],
      ['foo  bar', 'foo_bar'],
      ['foo#bar', 'foo_bar'],
      ['foo$bar', 'foo_bar'],
      ['foo-bar', 'foo_bar'],
      ['foo_bar', 'foo_bar'],
      ['foo!@#$%^&*()-bar', 'foo_bar'],
      ['fooBAR', 'foo_bar'],
      ['foo1BB2AA3RR', 'foo1_bb2_aa3_rr'],
    ]

    for (const [have, want] of tests) {
      const got = cased(have, 'snake_case')
      expect(got).toEqual(want)
    }
  })

  it('camelCase: should produce a properly cased ASCII string', () => {
    const tests = [
      ['fooBar', 'fooBar'],
      ['fooBar9', 'fooBar9'],
      ['foo4Bar9', 'foo4Bar9'],
      ['foo458Bar948', 'foo458Bar948'],
      ['48bar', '48bar'],
      ['foobar', 'foobar'],
      ['foo bar', 'fooBar'],
      ['foo  bar', 'fooBar'],
      ['foo#bar', 'fooBar'],
      ['foo$bar', 'fooBar'],
      ['foo-bar', 'fooBar'],
      ['foo_bar', 'fooBar'],
      ['foo!@#$%^&*()-bar', 'fooBar'],
      ['fooBAR', 'fooBar'],
      ['foo1BB2AA3RR', 'foo1Bb2Aa3Rr'],
    ]

    for (const [have, want] of tests) {
      const got = cased(have, 'camelCase')
      expect(got).toEqual(want)
    }
  })

  it('PascalCase: should produce a properly cased ASCII string', () => {
    const tests = [
      ['fooBar', 'FooBar'],
      ['fooBar9', 'FooBar9'],
      ['foo4Bar9', 'Foo4Bar9'],
      ['foo458Bar948', 'Foo458Bar948'],
      ['48bar', '48bar'],
      ['foobar', 'Foobar'],
      ['foo bar', 'FooBar'],
      ['foo  bar', 'FooBar'],
      ['foo#bar', 'FooBar'],
      ['foo$bar', 'FooBar'],
      ['foo-bar', 'FooBar'],
      ['foo_bar', 'FooBar'],
      ['foo!@#$%^&*()-bar', 'FooBar'],
      ['fooBAR', 'FooBar'],
      ['foo1BB2AA3RR', 'Foo1Bb2Aa3Rr'],
    ]

    for (const [have, want] of tests) {
      const got = cased(have, 'PascalCase')
      expect(got).toEqual(want)
    }
  })
})
