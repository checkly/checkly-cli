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

## Dashboard

- Import the `Dashboard` construct from `checkly/constructs`.
- Dashboards are used to display the results of your checks on screens external to Checkly.

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
