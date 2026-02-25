import type { IncidentUpdate, StatusPageIncident } from '../../../rest/incidents'

export const investigatingIncident: StatusPageIncident = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Checkout API outage',
  severity: 'CRITICAL',
  lastUpdateStatus: 'INVESTIGATING',
  services: [
    { id: 'svc-1111', name: 'Checkout API', accountId: 'acc-1' },
    { id: 'svc-2222', name: 'Payments API', accountId: 'acc-1' },
  ],
  incidentUpdates: [
    {
      id: 'upd-1111',
      description: 'We are investigating elevated error rates.',
      status: 'INVESTIGATING',
      created_at: '2026-02-25T10:00:00.000Z',
      publicIncidentUpdateDate: '2026-02-25T10:00:00.000Z',
      notifySubscribers: false,
    },
  ],
  created_at: '2026-02-25T10:00:00.000Z',
  updated_at: '2026-02-25T10:05:00.000Z',
}

export const resolvedIncident: StatusPageIncident = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Email delay',
  severity: 'MINOR',
  lastUpdateStatus: 'RESOLVED',
  services: [
    { id: 'svc-3333', name: 'Email worker', accountId: 'acc-1' },
  ],
  incidentUpdates: [
    {
      id: 'upd-2222',
      description: 'Issue resolved and queue drained.',
      status: 'RESOLVED',
      created_at: '2026-02-25T09:30:00.000Z',
      publicIncidentUpdateDate: '2026-02-25T09:30:00.000Z',
      notifySubscribers: false,
    },
  ],
  created_at: '2026-02-25T08:30:00.000Z',
  updated_at: '2026-02-25T09:30:00.000Z',
}

export const monitoringUpdate: IncidentUpdate = {
  id: 'upd-3333',
  description: 'Mitigation deployed, monitoring error rates.',
  status: 'MONITORING',
  created_at: '2026-02-25T11:00:00.000Z',
  publicIncidentUpdateDate: '2026-02-25T11:00:00.000Z',
  notifySubscribers: false,
}
