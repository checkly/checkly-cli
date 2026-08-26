# Supporting Constructs

## Status Page

- Import the `StatusPage` construct from `checkly/constructs`.
- Status pages are used to display the status of your services to your users.
- A Status Page consists of cards which include Status Page Services.

<!-- EXAMPLE: STATUS_PAGE -->

## Status Page Service

- Import the `StatusPageService` construct from `checkly/constructs`.
- Status Page Services are used to represent individual services on a Status Page.

<!-- EXAMPLE: STATUS_PAGE_SERVICE -->

## Status Page V3 (components)

- Import `StatusPageV3`, `StatusPageV3Component` and `StatusPageV3AutomationRule` from `checkly/constructs`.
- A v3 status page has no cards or services. Its structure is declared with `StatusPageV3Component` constructs that point at the page via `statusPage`; nest a `SERVICE` under a `GROUP` via `parent`.
- `StatusPageV3AutomationRule` opens one incident impacting the listed components when a check whose tags overlap with the rule's `tags` fails, and resolves it on recovery. Requires the automated incident management add-on.
- A logical id deployed as a `StatusPage` cannot be redeployed as a `StatusPageV3` (or vice versa); use a new logical id.

```ts
import { StatusPageV3, StatusPageV3AutomationRule, StatusPageV3Component } from 'checkly/constructs'

const statusPage = new StatusPageV3('example-status-page-v3', {
  name: 'Example Status Page',
  url: 'example-status-page-v3',
  customDomain: 'status.example.com',
  defaultTheme: 'AUTO',
})

const webApp = new StatusPageV3Component('example-web-app-group', {
  statusPage,
  type: 'GROUP',
  name: 'Web application',
  displayOrder: 1,
})

const signUp = new StatusPageV3Component('example-sign-up-service', {
  statusPage,
  parent: webApp,
  type: 'SERVICE',
  name: 'Sign up',
  description: 'The sign up flow',
  displayOrder: 1,
})

new StatusPageV3AutomationRule('example-api-down-rule', {
  statusPage,
  name: 'API down',
  firstUpdate: 'The API is down, we are investigating.',
  lastUpdate: 'The API has recovered.',
  tags: ['api:public'],
  coolDownMinutes: 5,
  components: [{ component: signUp, targetImpact: 'MAJOR_OUTAGE' }],
})
```

## Dashboard

- Import the `Dashboard` construct from `checkly/constructs`.
- Dashboards are used to display the results of your checks on screens external to Checkly.
- To apply custom styling, set `customCSS` to an entrypoint object so Checkly bundles and hosts the file: `customCSS: { entrypoint: './dashboard.css' }`. Passing a raw string read with `fs.readFileSync` is rejected at deploy time.

<!-- EXAMPLE: DASHBOARD -->

## Maintenance Window

- Import the `MaintenanceWindow` construct from `checkly/constructs`.
- Maintenance windows are used to pause checks during maintenance periods so no alerts are sent.
- Checks are referenced by their tags in the `tags` property.

<!-- EXAMPLE: MAINTENANCE_WINDOW -->

## Private Location

- Import the `PrivateLocation` construct from `checkly/constructs`.
- Private locations are used to run checks from your own infrastructure with the Checkly Agent, an OCI compatible container.

<!-- EXAMPLE: PRIVATE_LOCATION -->
