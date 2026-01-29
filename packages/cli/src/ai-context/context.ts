export const EXAMPLE_CONFIGS: Record<
  string,
  {
    templateString: string
    reference: string
    exampleConfig?: string
    exampleConfigPath?: string
  }
> = {
  CHECKLY_CONFIG: {
    templateString: '// INSERT CHECKLY CONFIG EXAMPLE HERE //',
    exampleConfig: `import { defineConfig } from 'checkly'
import { Frequency } from 'checkly/constructs'

export default defineConfig({
  projectName: "Production Monitoring Suite",
  logicalId: "prod-monitoring-2025",
  repoUrl: "https://github.com/acme/monitoring",
  checks: {
    activated: true,
    muted: false,
    runtimeId: "2025.04",
    frequency: Frequency.EVERY_10M,
    locations: ["us-east-1", "eu-west-1", "ap-southeast-1"],
    tags: ["production", "critical"],
    checkMatch: "**/__checks__/*.check.ts",
    ignoreDirectoriesMatch: ["node_modules/**", "dist/**"],
    playwrightConfig: {
      use: {
        baseURL: "https://app.example.com",
      },
    },
    browserChecks: {
      frequency: Frequency.EVERY_30M,
      testMatch: "**/__tests__/*.spec.ts",
    },
  },
  cli: {
    runLocation: "eu-west-1",
    privateRunLocation: "private-dc1",
    retries: 2,
  },
})
`,
    reference: 'https://www.checklyhq.com/docs/constructs/project.md',
  },
  BROWSER_CHECK: {
    templateString: '// INSERT BROWSER CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/browser-checks/example-browser-check/example-browser-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/browser-check.md',
  },
  PLAYWRIGHT_CHECK: {
    templateString: '// INSERT PLAYWRIGHT CHECK EXAMPLE HERE //',
    exampleConfig: `import { PlaywrightCheck } from "checkly/constructs"

const playwrightChecks = new PlaywrightCheck("multi-browser-check", {
  name: "Multi-browser check suite",
  playwrightConfigPath: "./playwright.config.ts",
  // Playwright Check Suites support all browsers
  // defined in your \`playwright.config\`
  pwProjects: ["chromium", "firefox", "webkit"],
});
`,
    reference: 'https://www.checklyhq.com/docs/constructs/playwright-check.md',
  },
  API_CHECK: {
    templateString: '// INSERT API CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/api-checks/example-api-check/example-api-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/api-check.md',
  },
  MULTISTEP_CHECK: {
    templateString: '// INSERT MULTISTEP CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/multi-step-checks/example-multistep-check/example-multistep-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/multistep-check.md',
  },
  TCP_MONITOR: {
    templateString: '// INSERT TCP MONITOR EXAMPLE HERE //',
    exampleConfigPath: 'resources/tcp-monitors/example-tcp-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/tcp-monitor.md',
  },
  HEARTBEAT_MONITOR: {
    templateString: '// INSERT HEARTBEAT MONITOR EXAMPLE HERE //',
    exampleConfigPath:
      'resources/heartbeat-monitors/example-heartbeat-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/heartbeat-monitor.md',
  },
  URL_MONITOR: {
    templateString: '// INSERT URL MONITOR EXAMPLE HERE //',
    exampleConfigPath: 'resources/url-monitors/example-url-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/url-monitor.md',
  },
  DNS_MONITOR: {
    templateString: '// INSERT DNS MONITOR EXAMPLE HERE //',
    exampleConfigPath: 'resources/dns-monitors/example-dns-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/dns-monitor.md',
  },
  CHECK_GROUP: {
    templateString: '// INSERT CHECK GROUP EXAMPLE HERE //',
    exampleConfigPath:
      'resources/check-group/example-group/example-group.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/check-group.md',
  },
  STATUS_PAGE: {
    templateString: '// INSERT STATUS PAGE EXAMPLE HERE //',
    exampleConfigPath: 'resources/status-pages/example-status-page.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/status-page.md',
  },
  STATUS_PAGE_SERVICE: {
    templateString: '// INSERT STATUS PAGE SERVICE EXAMPLE HERE //',
    exampleConfigPath:
      'resources/status-pages/services/example-service.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/status-page-service.md',
  },
  DASHBOARD: {
    templateString: '// INSERT DASHBOARD EXAMPLE HERE //',
    exampleConfigPath:
      'resources/dashboards/example-dashboard/example-dashboard.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/dashboard.md',
  },
  MAINTENANCE_WINDOW: {
    templateString: '// INSERT MAINTENANCE WINDOW EXAMPLE HERE //',
    exampleConfigPath:
      'resources/maintenance-windows/example-maintenance-window.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/maintenance-window.md',
  },
  PRIVATE_LOCATION: {
    templateString: '// INSERT PRIVATE LOCATION EXAMPLE HERE //',
    exampleConfigPath:
      'resources/private-locations/example-private-location.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/private-location.md',
  },
  EMAIL_ALERT_CHANNEL: {
    templateString: '// INSERT EMAIL ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath: 'resources/alert-channels/email/test.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/email-alert-channel.md',
  },
  PHONE_CALL_ALERT_CHANNEL: {
    templateString: '// INSERT PHONE CALL ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath: 'resources/alert-channels/phone-call/test-user.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/phone-call-alert-channel.md',
  },
  SLACK_ALERT_CHANNEL: {
    templateString: '// INSERT SLACK ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath: 'resources/alert-channels/slack/general.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/slack-alert-channel.md',
  },
}
