import { describe, expect, it } from 'vitest'
import { stripAnsi } from '../render'
import {
  formatIncidentDetail,
  formatIncidentUpdateDetail,
  formatIncidentsList,
} from '../incidents'
import {
  investigatingIncident,
  monitoringUpdate,
  resolvedIncident,
} from './__fixtures__/incident-fixtures'

describe('formatIncidentsList', () => {
  describe('terminal', () => {
    it('renders a table with incident rows', () => {
      const result = stripAnsi(formatIncidentsList([investigatingIncident, resolvedIncident], 'terminal'))
      expect(result).toContain('NAME')
      expect(result).toContain('SEVERITY')
      expect(result).toContain('STATUS')
      expect(result).toContain('Checkout API outage')
      expect(result).toContain('Email delay')
    })

    it('shows normalized status and severity labels', () => {
      const result = stripAnsi(formatIncidentsList([investigatingIncident], 'terminal'))
      expect(result).toContain('critical')
      expect(result).toContain('investigating')
    })
  })

  describe('md', () => {
    it('renders markdown table headers', () => {
      const result = formatIncidentsList([investigatingIncident], 'md')
      expect(result).toContain('| Name |')
      expect(result).toContain('| Severity |')
      expect(result).toContain('| Status |')
      expect(result).toContain('| Services |')
      expect(result).toContain('| Updated |')
      expect(result).toContain('| ID |')
    })
  })
})

describe('formatIncidentDetail', () => {
  it('renders incident detail and services in terminal output', () => {
    const result = stripAnsi(formatIncidentDetail(investigatingIncident, 'terminal'))
    expect(result).toContain('Checkout API outage')
    expect(result).toContain('SERVICES')
    expect(result).toContain('Checkout API')
    expect(result).toContain('LATEST UPDATE')
    expect(result).toContain('We are investigating elevated error rates.')
  })

  it('renders markdown detail and latest update', () => {
    const result = formatIncidentDetail(investigatingIncident, 'md')
    expect(result).toContain('# Checkout API outage')
    expect(result).toContain('## Services')
    expect(result).toContain('## Latest Update')
    expect(result).toContain('investigating')
  })
})

describe('formatIncidentUpdateDetail', () => {
  it('renders terminal detail for an incident update', () => {
    const result = stripAnsi(formatIncidentUpdateDetail(investigatingIncident.id, monitoringUpdate, 'terminal'))
    expect(result).toContain('Incident ID')
    expect(result).toContain('monitoring')
    expect(result).toContain('Mitigation deployed')
  })

  it('renders markdown detail for an incident update', () => {
    const result = formatIncidentUpdateDetail(investigatingIncident.id, monitoringUpdate, 'md')
    expect(result).toContain('# Incident Update')
    expect(result).toContain('| Field | Value |')
    expect(result).toContain('| Status | monitoring |')
  })
})
