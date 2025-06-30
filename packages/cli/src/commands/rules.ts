import { BaseCommand } from './baseCommand'
import { checklyRulesTemplate } from '../rules/checkly.rules'

export default class Rules extends BaseCommand {
  static hidden = false
  static description = 'Generate a rules file to use with AI IDEs and code assistants.'

  async run (): Promise<void> {
    try {
      // Use the template from the TypeScript file
      let content = checklyRulesTemplate

      // Unescape backticks for proper markdown formatting
      content = this.unescapeBackticks(content)

      // Replace placeholders with actual code examples
      content = this.replacePlaceholders(content)

      this.log(content)
    } catch (error) {
      this.error(`Failed to process template: ${error}`)
    }
  }

  private unescapeBackticks(content: string): string {
    return content.replace(/\\`/g, '`')
  }

  private replacePlaceholders(content: string): string {
    const examples = {
      'BROWSER_CHECK': this.getBrowserCheckExample(),
      'MULTISTEP_CHECK': this.getMultiStepCheckExample(),
      'TCP_CHECK': this.getTcpCheckExample(),
      'HEARTBEAT_CHECK': this.getHeartbeatCheckExample()
    }

    for (const [checkType, example] of Object.entries(examples)) {
      const placeholder = `<<INSERT ${checkType} EXAMPLE HERE>>`
      content = content.replace(placeholder, example)
    }

    return content
  }

  private getBrowserCheckExample(): string {
    return `\`\`\`typescript
import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('homepage-check', {
  name: 'Homepage Check',
  code: {
    entrypoint: './homepage.spec.ts'
  },
  activated: true,
  muted: false,
  shouldFail: false,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['homepage', 'critical'],
  frequency: 10,
  environmentVariables: [
    {
      key: 'BASE_URL',
      value: '{{BASE_URL}}'
    }
  ]
})
\`\`\`

\`\`\`typescript
import { test, expect } from '@playwright/test'

test('Homepage loads correctly', async ({ page }) => {
  await page.goto(process.env.BASE_URL || 'https://example.com')
  await expect(page).toHaveTitle(/Example/)
  await expect(page.locator('h1')).toBeVisible()
})
\`\`\``
  }

  private getMultiStepCheckExample(): string {
    return `\`\`\`typescript
import { MultiStepCheck } from 'checkly/constructs'

new MultiStepCheck('user-journey-check', {
  name: 'User Journey Check',
  code: {
    entrypoint: './user-journey.spec.ts'
  },
  activated: true,
  muted: false,
  shouldFail: false,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['user-journey', 'critical'],
  frequency: 60,
  environmentVariables: [
    {
      key: 'BASE_URL',
      value: '{{BASE_URL}}'
    },
    {
      key: 'TEST_EMAIL',
      value: '{{TEST_EMAIL}}'
    }
  ]
})
\`\`\`

\`\`\`typescript
// user-journey.spec.ts
import { test, expect } from '@playwright/test'

test('Complete user journey', async ({ page }) => {
  // Step 1: Navigate to homepage
  await page.goto(process.env.BASE_URL || 'https://example.com')
  
  // Step 2: Navigate to login
  await page.click('a[href="/login"]')
  
  // Step 3: Fill login form
  await page.fill('input[name="email"]', process.env.TEST_EMAIL || 'test@example.com')
  await page.fill('input[name="password"]', '{{TEST_PASSWORD}}')
  
  // Step 4: Submit and verify
  await page.click('button[type="submit"]')
  await expect(page.locator('.dashboard')).toBeVisible()
})
\`\`\``
  }

  private getTcpCheckExample(): string {
    return `\`\`\`typescript
import { TcpCheck, TcpAssertionBuilder } from 'checkly/constructs'

new TcpCheck('database-tcp-check', {
  name: 'Database TCP Check',
  host: '{{DB_HOST}}',
  port: 5432,
  activated: true,
  muted: false,
  shouldFail: false,
  locations: ['us-east-1', 'eu-west-1'],
  tags: ['database', 'infrastructure'],
  frequency: 60,
  assertions: [
    TcpAssertionBuilder.responseTime().lessThan(1000)
  ]
})
\`\`\``
  }

  private getHeartbeatCheckExample(): string {
    return `\`\`\`typescript
import { HeartbeatCheck } from 'checkly/constructs'

new HeartbeatCheck('cron-job-heartbeat', {
  name: 'Cron Job Heartbeat',
  period: 86400, // 24 hours in seconds
  periodUnit: 'seconds',
  grace: 3600, // 1 hour grace period
  activated: true,
  muted: false,
  shouldFail: false,
  tags: ['cron', 'background-jobs']
})
\`\`\``
  }
}
