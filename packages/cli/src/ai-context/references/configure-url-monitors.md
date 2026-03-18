# URL Monitor

- Import the `UrlMonitor` construct from `checkly/constructs`.
- When adding `assertions`, always use `UrlAssertionBuilder`.
- **Important:** The target URL must be publicly accessible — checks run on Checkly's cloud, not locally.

<!-- EXAMPLE: URL_MONITOR -->
