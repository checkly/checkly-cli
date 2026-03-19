# Browser Checks

- Import the `BrowserCheck` construct from `checkly/constructs`.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `BrowserCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.
- **Important:** The target URL must be publicly accessible — checks run on Checkly's cloud, not locally.
- **Plan-gated properties:** `retryStrategy`, `runParallel`, and higher frequencies may not be available on all plans. Check entitlements matching `BROWSER_CHECKS_*` before using these. Omit any property whose entitlement is disabled. See `npx checkly skills manage` for details.

<!-- EXAMPLE: BROWSER_CHECK -->
