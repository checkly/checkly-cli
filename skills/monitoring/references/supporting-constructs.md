# Supporting Constructs

## Status Page

- Import the `StatusPage` construct from `checkly/constructs`.
- Status pages are used to display the status of your services to your users.
- A Status Page consists of cards which include Status Page Services.

**Reference:** https://www.checklyhq.com/docs/constructs/status-page/

```typescript
import { StatusPage } from 'checkly/constructs'
import { exampleService } from './services/example-service.check'

new StatusPage('example-status-page', {
  name: 'Example Status Page',
  url: 'example-status-page',
  cards: [
    {
      name: 'Example service',
      services: [
        exampleService,
      ],
    },
  ],
  customDomain: 'status.example.com',
  defaultTheme: 'AUTO',
})
```

## Status Page Service

- Import the `StatusPageService` construct from `checkly/constructs`.
- Status Page Services are used to represent individual services on a Status Page.

**Reference:** https://www.checklyhq.com/docs/constructs/status-page-service/

```typescript
import { StatusPageService } from 'checkly/constructs'

export const exampleService = new StatusPageService('example-status-page-service', {
  name: 'Example Service',
})
```

## Dashboard

- Import the `Dashboard` construct from `checkly/constructs`.
- Dashboards are used to display the results of your checks on screens external to Checkly.

**Reference:** https://www.checklyhq.com/docs/constructs/dashboard/

```typescript
import { Dashboard } from 'checkly/constructs'

new Dashboard('example-dashboard', {
  tags: [
    'app:webshop',
  ],
  customUrl: 'example-dashboard',
  customDomain: 'dash.example.com',
  header: 'Example Dashboard',
  description: 'Example dashboard',
  width: 'FULL',
  refreshRate: 60,
  paginate: true,
  paginationRate: 60,
  checksPerPage: 15,
  useTagsAndOperator: false,
  hideTags: false,
  enableIncidents: false,
  expandChecks: false,
  showHeader: true,
  isPrivate: false,
  showP95: true,
  showP99: true,
})
```

## Maintenance Window

- Import the `MaintenanceWindow` construct from `checkly/constructs`.
- Maintenance windows are used to pause checks during maintenance periods so no alerts are sent.
- Checks are referenced by their tags in the `tags` property.

**Reference:** https://www.checklyhq.com/docs/constructs/maintenance-window/

```typescript
import { MaintenanceWindow } from 'checkly/constructs'

new MaintenanceWindow('example-maintenance-window', {
  name: 'Example Maintenance Window',
  tags: [
    'app:webshop',
  ],
  startsAt: new Date('2025-07-01T09:00:00.000Z'),
  endsAt: new Date('2025-07-01T10:00:00.000Z'),
  repeatInterval: 1,
  repeatUnit: 'WEEK',
  repeatEndsAt: new Date('2025-08-01T00:00:00.000Z'),
})
```

## Private Location

- Import the `PrivateLocation` construct from `checkly/constructs`.
- Private locations are used to run checks from your own infrastructure with the Checkly Agent, an OCI compatible container.

**Reference:** https://www.checklyhq.com/docs/constructs/private-location/

```typescript
import { PrivateLocation } from 'checkly/constructs'

export const examplePrivateLocation = new PrivateLocation('example-private-location', {
  name: 'Example Private Location',
  slugName: 'example-private-location',
  icon: 'location',
})
```
