import { describe, it, expect } from 'vitest'

import { DnsAssertionBuilder } from '../dns-assertion'

describe('DnsAssertionBuilder', () => {
  describe('answer assertions', () => {
    it('answerData carries source ANSWER, property data and the quantifier', () => {
      expect(DnsAssertionBuilder.answerData('EVERY').equals('192.0.2.1')).toEqual({
        source: 'ANSWER',
        property: 'data',
        quantifier: 'EVERY',
        comparison: 'EQUALS',
        target: '192.0.2.1',
        regex: null,
      })
    })

    it('answerName / answerType set the matching property', () => {
      expect(DnsAssertionBuilder.answerName('SOME').equals('acme.com.')).toMatchObject({
        source: 'ANSWER',
        property: 'name',
        quantifier: 'SOME',
      })
      expect(DnsAssertionBuilder.answerType('NONE').equals('CNAME')).toMatchObject({
        source: 'ANSWER',
        property: 'type',
        quantifier: 'NONE',
      })
    })

    it('answerTtl is numeric and quantifier-aware', () => {
      expect(DnsAssertionBuilder.answerTtl('EVERY').greaterThan(300)).toEqual({
        source: 'ANSWER',
        property: 'ttl',
        quantifier: 'EVERY',
        comparison: 'GREATER_THAN',
        target: '300',
        regex: null,
      })
    })

    it('answerCount is numeric and carries NO quantifier', () => {
      const assertion = DnsAssertionBuilder.answerCount().greaterThan(0)
      expect(assertion).toEqual({
        source: 'ANSWER',
        property: 'count',
        comparison: 'GREATER_THAN',
        target: '0',
        regex: null,
      })
      expect('quantifier' in assertion).toBe(false)
    })

    it('answerData supports matches / notMatches (regex comparators)', () => {
      expect(DnsAssertionBuilder.answerData('SOME').matches('^10\\.')).toMatchObject({
        source: 'ANSWER',
        property: 'data',
        quantifier: 'SOME',
        comparison: 'MATCHES',
        target: '^10\\.',
      })
      expect(DnsAssertionBuilder.answerData('NONE').notMatches('^192\\.')).toMatchObject({
        comparison: 'NOT_MATCHES',
        quantifier: 'NONE',
      })
    })
  })

  describe('matches / notMatches on the shared general builder', () => {
    it('are available on textAnswer / jsonAnswer and omit a quantifier', () => {
      const textAssertion = DnsAssertionBuilder.textAnswer().matches('foo.*')
      expect(textAssertion).toMatchObject({
        source: 'TEXT_ANSWER',
        comparison: 'MATCHES',
        target: 'foo.*',
      })
      expect('quantifier' in textAssertion).toBe(false)

      expect(DnsAssertionBuilder.jsonAnswer('$.Answer[0].data').notMatches('bar'))
        .toMatchObject({
          source: 'JSON_ANSWER',
          comparison: 'NOT_MATCHES',
          target: 'bar',
        })
    })
  })

  describe('existing assertions are unchanged', () => {
    it('responseCode still emits no quantifier key', () => {
      const assertion = DnsAssertionBuilder.responseCode().equals('NOERROR')
      expect(assertion).toEqual({
        source: 'RESPONSE_CODE',
        property: '',
        comparison: 'EQUALS',
        target: 'NOERROR',
        regex: null,
      })
      expect('quantifier' in assertion).toBe(false)
    })
  })
})
