// Packed files generated automatically

export const EXAMPLE_SPEC_TS = `import { spawn } from 'child_process';
import { test } from '@playwright/test';
import * as net from 'net';

test('has title', async ({ page }) => {
  const browserPath = '/checkly/browsers/chromium-1181/chrome-linux/chrome';
  const MCP_PORT = 8931;
  const TEN_MINUTES_MS = 20 * 60 * 1000; // 20 minutes in milliseconds

  // Set timeout for the test
  test.setTimeout(TEN_MINUTES_MS);

  // Function to check if a port is in use
  function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.once('close', () => {
          resolve(false); // Port is available
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(true); // Port is in use
      });
    });
  }

  // Function to run pinggy to expose MCP port
  async function runPinggy(port: number) {
    console.log(\`Starting pinggy to expose port \${port}...\`);
    
    const pinggyProcess = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'LogLevel=ERROR',
      '-p', '443', 
      '-R', \`0:localhost:\${port}\`, 
      'a.pinggy.io'
    ], {
      stdio: 'pipe',
      shell: false
    });

    // Handle pinggy output
    pinggyProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log(\`Pinggy stdout: \${output}\`);
      
      // Look for HTTPS URL in the output
      const httpsMatch = output.match(/https:\\/\\/[a-z0-9-]+\\.a\\.free\\.pinggy\\.link/);
      if (httpsMatch) {
        const publicUrl = httpsMatch[0];
        console.log(\`🌐 PINGGY PUBLIC URL: \${publicUrl}\`);
      }
    });

    pinggyProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.log(\`Pinggy stderr: \${output}\`);
      
      // Also check stderr for URLs (pinggy might output there)
      const httpsMatch = output.match(/https:\\/\\/[a-z0-9-]+\\.a\\.free\\.pinggy\\.link/);
      if (httpsMatch) {
        const publicUrl = httpsMatch[0];
        console.log(\`🌐 PINGGY PUBLIC URL: \${publicUrl}\`);
      }
    });

    pinggyProcess.on('close', (code) => {
      console.log(\`Pinggy process exited with code \${code}\`);
    });

    pinggyProcess.on('error', (error) => {
      console.error(\`Pinggy process error: \${error}\`);
    });

    return pinggyProcess;
  }

  // Function to run MCP server
  async function runMCPServer() {
    // Check if port is already in use
    const portInUse = await isPortInUse(MCP_PORT);
    if (portInUse) {
      console.log(\`Port \${MCP_PORT} is already in use. MCP server may already be running.\`);
      return null;
    }

    console.log('Starting MCP server...');

    const mcpProcess = spawn('npx', ['-y', '@playwright/mcp@latest', '--port', \`\${MCP_PORT}\`, '--executable-path', browserPath, '--isolated'], {
      stdio: 'pipe',
      shell: true
    });

    // Handle process output
    mcpProcess.stdout?.on('data', (data) => {
      console.log(\`MCP stdout: \${data.toString().trim()}\`);
    });

    mcpProcess.stderr?.on('data', (data) => {
      console.log(\`MCP stderr: \${data.toString().trim()}\`);
    });

    mcpProcess.on('close', (code) => {
      console.log(\`MCP process exited with code \${code}\`);
    });

    mcpProcess.on('error', (error) => {
      console.error(\`MCP process error: \${error}\`);
    });

    return mcpProcess;
  }

  // Main async function to run all setup
  async function setupAndRun() {
    console.log("Running MCP server with a timeout of 30 seconds...");
    const mcpServerProcess = await runMCPServer();
    
    if (mcpServerProcess) {
      console.log("MCP server started. You can now run your Playwright tests.");
      
      // Start pinggy to expose the MCP server
      console.log("Starting pinggy to expose MCP server...");
      const pinggyProcess = await runPinggy(MCP_PORT);
    } else {
      console.log("MCP server not started (port already in use).");
    }
  }

  // Run the setup
  await setupAndRun();
  
  console.log("logging in a test");
  
  // Wait for the specified timeout
  await new Promise(resolve => setTimeout(resolve, TEN_MINUTES_MS));
});`;

export const CHECKLY_CONFIG_TS = `import { defineConfig } from 'checkly'
import { Frequency } from 'checkly/constructs'

export default defineConfig({
  projectName: 'MCP Server Instance',
  logicalId: 'cool-website-monitoring',
  repoUrl: 'https://github.com/acme/website',
  checks: {
    playwrightConfigPath: './playwright.config.ts',
    playwrightChecks: [
      {
        /**
         * Create a multi-browser check that runs
         * every 10 mins in two locations.
         */
        logicalId: 'multi-browser',
        name: 'Playwright MCP Server',
        // Use one project (or multiple projects) defined in your Playwright config
        pwProjects: ['chromium'],
        // Use one tag (or multiple tags) defined in your spec files
        //pwTags: '@smoke-tests',
        frequency: Frequency.EVERY_10M,
        locations: ['us-east-1', 'eu-west-1'],
      },
      // {
      //   /**
      //    * Create a check that runs the \`@critical\` tagged tests
      //    * every 5 mins in three locations.
      //    */
      //   logicalId: 'critical-tagged',
      //   name: 'Critical Tagged tests',
      //   // Use one project (or multiple projects) defined in your Playwright config
      //   pwProjects: ['chromium'],
      //   // Use one tag (or multiple tags) defined in your spec files
      //   pwTags: '@critical',
      //   frequency: Frequency.EVERY_5M,
      //   locations: ['us-east-1', 'eu-central-1', 'ap-southeast-2'],
      // },
    ],
  },
  cli: {
    runLocation: 'us-east-1',
    retries: 0,
  },
})
`;

export const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": [
    "*.ts"
  ],
  "exclude": [
    "node_modules",
    "dist"
  ],
  "ts-node": {
    "esm": false,
    "compilerOptions": {
      "module": "commonjs"
    }
  }
}
`;

export const PACKAGE_JSON = `{
  "name": "hackathon_pwmcp",
  "version": "1.0.0",
  "description": "MCP Manager API for Playwright server instances with ngrok",
  "main": "mcp-manager-api.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/mcp-manager-api.js",
    "dev": "ts-node mcp-manager-api.ts",
    "test": "npx playwright test"
  },
  "keywords": ["mcp", "playwright", "ngrok", "api", "typescript"],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "@playwright/test": "^1.54.1",
    "@types/express": "^5.0.3",
    "@types/node": "^24.0.15",
    "@types/uuid": "^10.0.0",
    "checkly": "^0.0.0-pr.1111.e932b3e",
    "jiti": "^2.4.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3"
  },
  "dependencies": {
    "express": "^4.18.2",
    "ngrok": "^5.0.0-beta.2",
    "uuid": "^10.0.0"
  }
}
`;

