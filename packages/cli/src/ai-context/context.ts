export const REFERENCES = [
  {
    id: 'configure-api-checks',
    description: 'Api Check construct (`ApiCheck`), assertions, and authentication setup scripts',
  },
  {
    id: 'configure-browser-checks',
    description: 'Browser Check construct (`BrowserCheck`) with Playwright test files',
  },
  {
    id: 'configure-playwright-checks',
    description: 'Playwright Check Suite construct (`PlaywrightCheck`) for multi-browser test suites',
  },
  {
    id: 'configure-multistep-checks',
    description: 'Multistep Check construct (`MultiStepCheck`) for complex user flows',
  },
  {
    id: 'configure-tcp-monitors',
    description: 'TCP Monitor construct (`TcpMonitor`) with assertions',
  },
  {
    id: 'configure-url-monitors',
    description: 'URL Monitor construct (`UrlMonitor`) with assertions',
  },
  {
    id: 'configure-dns-monitors',
    description: 'DNS Monitor construct (`DnsMonitor`) with assertions',
  },
  {
    id: 'configure-icmp-monitors',
    description: 'ICMP Monitor construct (`IcmpMonitor`) with latency and packet loss assertions',
  },
  {
    id: 'configure-heartbeat-monitors',
    description: 'Heartbeat Monitor construct (`HeartbeatMonitor`)',
  },
  {
    id: 'configure-check-groups',
    description: 'CheckGroupV2 construct (`CheckGroupV2`) for organizing checks',
  },
  {
    id: 'configure-alert-channels',
    description: 'Email (`EmailAlertChannel`), Phone (`PhoneCallAlertChannel`), and Slack (`SlackAlertChannel`) alert channels',
  },
  {
    id: 'configure-supporting-constructs',
    description: 'Status pages (`StatusPage`), dashboards (`Dashboard`), maintenance windows (`MaintenanceWindow`), and private locations (`PrivateLocation`)',
  },
] as const

export const MANAGE_REFERENCES = [
  {
    id: 'manage-checks',
    description: 'Inspecting checks (`checks list`, `checks get`) and triggering on-demand runs',
  },
  {
    id: 'manage-incidents',
    description: 'Incident lifecycle (`incidents create`, `update`, `resolve`, `list`) and status pages',
  },
] as const

export const SKILL = {
  name: 'checkly',
  description: 'Get all the information and context to let your agent initialize, set up, create, test and manage your monitoring checks using the Checkly CLI.',
} as const

export const ACTIONS = [
  {
    id: 'initialize',
    description: 'Learn how to initialize and set up a new Checkly CLI project from scratch.',
  },
  {
    id: 'configure',
    description: 'Learn how to create and manage monitoring checks using Checkly constructs and the CLI.',
    references: REFERENCES,
  },
  {
    id: 'manage',
    description: 'Inspect checks, manage incidents, and operate status pages. Includes the confirmation protocol for write commands.',
    references: MANAGE_REFERENCES,
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
