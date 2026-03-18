# Browser Checks

- Import the `BrowserCheck` construct from `checkly/constructs`.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `BrowserCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.
- **Important:** The target URL must be publicly accessible — checks run on Checkly's cloud, not locally.

<!-- EXAMPLE: BROWSER_CHECK -->
