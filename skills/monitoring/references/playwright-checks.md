# Playwright Check Suites

- Import the `PlaywrightCheck` construct from `checkly/constructs`.
- use `pwProjects` if your tasked to reuse a Playwright project.

**Reference:** https://www.checklyhq.com/docs/constructs/playwright-check/

```typescript
import { PlaywrightCheck } from "checkly/constructs"

const playwrightChecks = new PlaywrightCheck("multi-browser-check", {
  name: "Multi-browser check suite",
  playwrightConfigPath: "./playwright.config.ts",
  // Playwright Check Suites support all browsers
  // defined in your `playwright.config`
  pwProjects: ["chromium", "firefox", "webkit"],
});
```
