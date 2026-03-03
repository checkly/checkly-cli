import type { StatusPage } from '../../../rest/status-pages'

export const simpleStatusPage: StatusPage = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name: 'Acme Status',
  url: 'acme-status',
  customDomain: 'status.acme.com',
  isPrivate: false,
  defaultTheme: 'AUTO',
  cards: [
    {
      id: 'card-1111-2222-3333-444444444444',
      name: 'Infrastructure',
      services: [
        { id: 'svc-1111', name: 'API Gateway' },
        { id: 'svc-2222', name: 'Database Cluster' },
        { id: 'svc-3333', name: 'CDN' },
      ],
    },
    {
      id: 'card-5555-6666-7777-888888888888',
      name: 'Web Applications',
      services: [
        { id: 'svc-4444', name: 'Dashboard' },
        { id: 'svc-5555', name: 'Marketing Site' },
      ],
    },
  ],
  created_at: '2025-01-10T08:00:00.000Z',
  updated_at: '2025-06-01T12:00:00.000Z',
}

export const privateStatusPage: StatusPage = {
  id: 'd4e5f6a7-b8c9-0123-defg-hij456789012',
  name: 'Internal Tools',
  url: 'internal-tools',
  customDomain: null,
  isPrivate: true,
  defaultTheme: 'DARK',
  cards: [
    {
      id: 'card-aaaa-bbbb-cccc-dddddddddddd',
      name: 'Core Services',
      services: [
        { id: 'svc-6666', name: 'CI Pipeline' },
      ],
    },
  ],
  created_at: '2025-03-20T14:30:00.000Z',
  updated_at: null,
}

export const noCardsStatusPage: StatusPage = {
  id: 'f7890123-4567-89ab-cdef-012345678901',
  name: 'Empty Page',
  url: 'empty-page',
  customDomain: null,
  isPrivate: false,
  defaultTheme: 'LIGHT',
  cards: [],
  created_at: '2025-05-01T00:00:00.000Z',
  updated_at: null,
}
