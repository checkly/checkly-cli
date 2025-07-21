import { AuthCommand } from './authCommand'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { spawn } from 'node:child_process'
import { EXAMPLE_SPEC_TS, CHECKLY_CONFIG_TS, TSCONFIG_JSON, PACKAGE_JSON } from '../templates/packed-files'

// Default playwright.config.ts since it's not in packed-files
const PLAYWRIGHT_CONFIG_TS = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});`

export default class McpCommand extends AuthCommand {
  static coreCommand = true
  static hidden = false
  static description = 'Run MCP server tests with Playwright on Checkly.'
  static state = 'beta'

  async run(): Promise<void> {
    let tempDir: string | null = null
    let pinggyUrl: string | null = null
      // Output initial "in progress" message
    this.log('starting mcp server in progress (this can take a while)..')
    this.log('it will run for 20 minutes and then exit automatically')
    try {
      // Create temporary directory
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkly-mcp-'))
      
      // Write all files to temp directory
      await fs.writeFile(path.join(tempDir, 'example.spec.ts'), EXAMPLE_SPEC_TS)
      await fs.writeFile(path.join(tempDir, 'checkly.config.ts'), CHECKLY_CONFIG_TS)
      await fs.writeFile(path.join(tempDir, 'tsconfig.json'), TSCONFIG_JSON)
      await fs.writeFile(path.join(tempDir, 'package.json'), PACKAGE_JSON)
      await fs.writeFile(path.join(tempDir, 'playwright.config.ts'), PLAYWRIGHT_CONFIG_TS)
      
      // Run npm install in the temp directory
      const { execa } = await import('execa')
      await execa('npm', ['install'], {
        cwd: tempDir,
        stdio: 'pipe' // Changed to pipe to suppress output
      })
      
    
      
      // Save current directory
      const originalCwd = process.cwd()
      
      // Change to temp directory
      process.chdir(tempDir)
      
      try {
        // Run pw-test command with stream-logs enabled using spawn to capture output
        const checklyPath = path.join(originalCwd, 'bin', 'run')
        const args = ['pw-test', '--stream-logs', ...this.argv]
        
        const pwTestProcess = spawn(checklyPath, args, {
          cwd: tempDir,
          env: { ...process.env },
          stdio: ['inherit', 'pipe', 'pipe']
        })
        
        // Capture stdout
        pwTestProcess.stdout?.on('data', (data) => {
          const output = data.toString()
          
          // Parse for Pinggy URL
          const urlMatch = output.match(/🌐 PINGGY PUBLIC URL:\s*(https:\/\/[a-z0-9-]+\.a\.free\.pinggy\.link)/)
          if (urlMatch && !pinggyUrl) {
            pinggyUrl = urlMatch[1]
            // Output JSON immediately when URL is found
            this.log(JSON.stringify({ serverUrl: pinggyUrl }))
          }
        })
        
        // Capture stderr as well
        pwTestProcess.stderr?.on('data', (data) => {
          const output = data.toString()
          
          // Also check stderr for URLs (pinggy might output there)
          const urlMatch = output.match(/🌐 PINGGY PUBLIC URL:\s*(https:\/\/[a-z0-9-]+\.a\.free\.pinggy\.link)/)
          if (urlMatch && !pinggyUrl) {
            pinggyUrl = urlMatch[1]
            // Output JSON immediately when URL is found
            this.log(JSON.stringify({ serverUrl: pinggyUrl }))
          }
        })
        
        // Wait for process to complete
        await new Promise<void>((resolve, reject) => {
          pwTestProcess.on('close', (code) => {
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(`Process exited with code ${code}`))
            }
          })
          
          pwTestProcess.on('error', (error) => {
            reject(error)
          })
        })
        
      } finally {
        // Always restore original directory
        process.chdir(originalCwd)
      }
      
    } catch (error) {
      // Suppress error output to keep it clean
      process.exit(1)
    } finally {
      // Clean up temp directory
      if (tempDir) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true })
        } catch (cleanupError) {
          // Suppress cleanup errors
        }
      }
    }
  }
}