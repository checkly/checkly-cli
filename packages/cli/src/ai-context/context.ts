export const REFERENCES = [
  {
    id: 'api-checks',
    linkText: 'API Checks',
    description: 'ApiCheck construct, assertions, and authentication setup scripts',
  },
  {
    id: 'browser-checks',
    linkText: 'Browser Checks',
    description: 'BrowserCheck construct with Playwright test files',
  },
  {
    id: 'playwright-checks',
    linkText: 'Playwright Checks',
    description: 'PlaywrightCheck construct for multi-browser test suites',
  },
  {
    id: 'multistep-checks',
    linkText: 'MultiStep Checks',
    description: 'MultiStepCheck construct for complex user flows',
  },
  {
    id: 'uptime-monitors',
    linkText: 'Uptime Monitors',
    description: 'TCP (`TcpMonitor`), URL (`UrlMonitor`), DNS (`DnsMonitor`), ICMP (`IcmpMonitor`), and Heartbeat monitors (`HeartbeatMonitor`)',
  },
  {
    id: 'check-groups',
    linkText: 'Check Groups',
    description: 'CheckGroupV2 construct for organizing checks',
  },
  {
    id: 'alert-channels',
    linkText: 'Alert Channels',
    description: 'Email, Phone, and Slack alert channels',
  },
  {
    id: 'supporting-constructs',
    linkText: 'Supporting Constructs',
    description: 'Status pages, dashboards, maintenance windows, and private locations',
  },
] as const

interface ExampleConfig {
  templateString: string
  reference: string
  exampleConfig?: string
  exampleConfigPath?: string
}

export const EXAMPLE_CONFIGS: Record<string, ExampleConfig> = {
  CHECKLY_CONFIG: {
    templateString: '<!-- EXAMPLE: CHECKLY_CONFIG -->',
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
    reference: 'https://www.checklyhq.com/docs/constructs/project/',
  },
  BROWSER_CHECK: {
    templateString: '<!-- EXAMPLE: BROWSER_CHECK -->',
    exampleConfigPath:
      'resources/browser-checks/example-browser-check/example-browser-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/browser-check/',
  },
  PLAYWRIGHT_CHECK: {
    templateString: '<!-- EXAMPLE: PLAYWRIGHT_CHECK -->',
    exampleConfig: `import { PlaywrightCheck } from "checkly/constructs"

const playwrightChecks = new PlaywrightCheck("multi-browser-check", {
  name: "Multi-browser check suite",
  playwrightConfigPath: "./playwright.config.ts",
  // Playwright Check Suites support all browsers
  // defined in your \`playwright.config\`
  pwProjects: ["chromium", "firefox", "webkit"],
});
`,
    reference: 'https://www.checklyhq.com/docs/constructs/playwright-check/',
  },
  API_CHECK: {
    templateString: '<!-- EXAMPLE: API_CHECK -->',
    exampleConfigPath:
      'resources/api-checks/example-api-check/example-api-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/api-check/',
  },
  MULTISTEP_CHECK: {
    templateString: '<!-- EXAMPLE: MULTISTEP_CHECK -->',
    exampleConfigPath:
      'resources/multi-step-checks/example-multistep-check/example-multistep-check.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/multistep-check/',
  },
  TCP_MONITOR: {
    templateString: '<!-- EXAMPLE: TCP_MONITOR -->',
    exampleConfigPath: 'resources/tcp-monitors/example-tcp-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/tcp-monitor/',
  },
  HEARTBEAT_MONITOR: {
    templateString: '<!-- EXAMPLE: HEARTBEAT_MONITOR -->',
    exampleConfigPath:
      'resources/heartbeat-monitors/example-heartbeat-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/heartbeat-monitor/',
  },
  URL_MONITOR: {
    templateString: '<!-- EXAMPLE: URL_MONITOR -->',
    exampleConfigPath: 'resources/url-monitors/example-url-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/url-monitor/',
  },
  DNS_MONITOR: {
    templateString: '<!-- EXAMPLE: DNS_MONITOR -->',
    exampleConfigPath: 'resources/dns-monitors/example-dns-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/dns-monitor/',
  },
  ICMP_MONITOR: {
    templateString: '<!-- EXAMPLE: ICMP_MONITOR -->',
    exampleConfigPath: 'resources/icmp-monitors/example-icmp-monitor.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/icmp-monitor/',
  },
  CHECK_GROUP: {
    templateString: '<!-- EXAMPLE: CHECK_GROUP -->',
    exampleConfigPath:
      'resources/check-group/example-group/example-group.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/check-group/',
  },
  STATUS_PAGE: {
    templateString: '<!-- EXAMPLE: STATUS_PAGE -->',
    exampleConfigPath: 'resources/status-pages/example-status-page.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/status-page/',
  },
  STATUS_PAGE_SERVICE: {
    templateString: '<!-- EXAMPLE: STATUS_PAGE_SERVICE -->',
    exampleConfigPath:
      'resources/status-pages/services/example-service.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/status-page-service/',
  },
  DASHBOARD: {
    templateString: '<!-- EXAMPLE: DASHBOARD -->',
    exampleConfigPath:
      'resources/dashboards/example-dashboard/example-dashboard.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/dashboard/',
  },
  MAINTENANCE_WINDOW: {
    templateString: '<!-- EXAMPLE: MAINTENANCE_WINDOW -->',
    exampleConfigPath:
      'resources/maintenance-windows/example-maintenance-window.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/maintenance-window/',
  },
  PRIVATE_LOCATION: {
    templateString: '<!-- EXAMPLE: PRIVATE_LOCATION -->',
    exampleConfigPath:
      'resources/private-locations/example-private-location.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/private-location/',
  },
  EMAIL_ALERT_CHANNEL: {
    templateString: '<!-- EXAMPLE: EMAIL_ALERT_CHANNEL -->',
    exampleConfigPath: 'resources/alert-channels/email/test.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/email-alert-channel/',
  },
  PHONE_CALL_ALERT_CHANNEL: {
    templateString: '<!-- EXAMPLE: PHONE_CALL_ALERT_CHANNEL -->',
    exampleConfigPath: 'resources/alert-channels/phone-call/test-user.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/phone-call-alert-channel/',
  },
  SLACK_ALERT_CHANNEL: {
    templateString: '<!-- EXAMPLE: SLACK_ALERT_CHANNEL -->',
    exampleConfigPath: 'resources/alert-channels/slack/general.check.ts',
    reference: 'https://www.checklyhq.com/docs/constructs/slack-alert-channel/',
  },
}
