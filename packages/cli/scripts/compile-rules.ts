/* eslint-disable no-console */
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const EXAMPLES_DIR = join(__dirname, '../gen/');
const RULES_TEMPLATE_PATH = join(
  __dirname,
  '../src/rules/checkly.rules.template.md'
);

const EXAMPLE_CONFIGS: Record<
  string,
  { templateString: string; exampleConfigPath: string }
> = {
  BROWSER_CHECK: {
    templateString: '// INSERT BROWSER CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/browser-checks/example-browser-check/example-browser-check.check.ts',
  },
  API_CHECK: {
    templateString: '// INSERT API CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/api-checks/example-api-check/example-api-check.check.ts',
  },
  MULTISTEP_CHECK: {
    templateString: '// INSERT MULTISTEP CHECK EXAMPLE HERE //',
    exampleConfigPath:
      'resources/multi-step-checks/example-multistep-check/example-multistep-check.check.ts',
  },
  TCP_MONITOR: {
    templateString: '// INSERT TCP MONITOR EXAMPLE HERE //',
    exampleConfigPath: 'resources/tcp-monitors/example-tcp-monitor.check.ts',
  },
  HEARTBEAT_MONITOR: {
    templateString: '// INSERT HEARTBEAT MONITOR EXAMPLE HERE //',
    exampleConfigPath:
      'resources/heartbeat-monitors/example-heartbeat-monitor.check.ts',
  },
  URL_MONITOR: {
    templateString: '// INSERT URL MONITOR EXAMPLE HERE //',
    exampleConfigPath: 'resources/url-monitors/example-url-monitor.check.ts',
  },
  CHECK_GROUP: {
    templateString: '// INSERT CHECK GROUP EXAMPLE HERE //',
    exampleConfigPath:
      'resources/check-group/example-group/example-group.check.ts',
  },
  STATUS_PAGE: {
    templateString: '// INSERT STATUS PAGE EXAMPLE HERE //',
    exampleConfigPath:
      'resources/status-pages/example-status-page.check.ts',
  },
  STATUS_PAGE_SERVICE: {
    templateString: '// INSERT STATUS PAGE SERVICE EXAMPLE HERE //',
    exampleConfigPath:
      'resources/status-pages/services/example-service.check.ts',
  },
  DASHBOARD: {
    templateString: '// INSERT DASHBOARD EXAMPLE HERE //',
    exampleConfigPath:
      'resources/dashboards/example-dashboard/example-dashboard.check.ts',
  },
  MAINTENANCE_WINDOW: {
    templateString: '// INSERT MAINTENANCE WINDOW EXAMPLE HERE //',
    exampleConfigPath:
      'resources/maintenance-windows/example-maintenance-window.check.ts',
  },
  PRIVATE_LOCATION: {
    templateString: '// INSERT PRIVATE LOCATION EXAMPLE HERE //',
    exampleConfigPath:
      'resources/private-locations/example-private-location.check.ts',
  },
  EMAIL_ALERT_CHANNEL: {
    templateString: '// INSERT EMAIL ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath:
      'resources/alert-channels/email/test.check.ts',
  },
  PHONE_CALL_ALERT_CHANNEL: {
    templateString: '// INSERT PHONE CALL ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath:
      'resources/alert-channels/phone-call/test-user.check.ts',
  },
  SLACK_ALERT_CHANNEL: {
    templateString: '// INSERT SLACK ALERT CHANNEL EXAMPLE HERE //',
    exampleConfigPath:
      'resources/alert-channels/slack/general.check.ts',
  },
};

async function compileRules() {
  try {
    console.log('📝 Compiling rules markdown with examples...');

    // Read template
    let content = await readFile(RULES_TEMPLATE_PATH, 'utf8');
    const examples = await readExampleCode();

    for (const example of examples) {
      // Replace placeholders with actual code examples
      content = content.replace(example.templateString, example.code);
    }

    // write file to dist/rules/checkly.rules.md
    const outputDir = join(__dirname, '../dist/rules');
    await mkdir(outputDir, { recursive: true });
    const outputPath = join(outputDir, 'checkly.rules.md');
    await writeFile(outputPath, content, 'utf8');
  } catch (error) {
    console.error('❌ Failed to compile rules:', error);
    process.exit(1);
  }
}

async function readExampleCode(): Promise<
  { templateString: string; code: string }[]
> {
  const examples: { templateString: string; code: string }[] = [];

  for (const exampleConfig of Object.values(EXAMPLE_CONFIGS)) {
    const filePath = join(EXAMPLES_DIR, exampleConfig.exampleConfigPath);
    try {
      const code = await readFile(filePath, 'utf8');
      examples.push({
        templateString: exampleConfig.templateString,
        code,
      });
    } catch {
      console.warn(
        `Warning: Could not generate example for ${exampleConfig.templateString} from ${filePath}. It might not exist or be accessible.`
      );
    }
  }

  return examples;
}

compileRules();
