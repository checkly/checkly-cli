import * as fs from 'fs'
import * as path from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { generateProjectName, isValidProjectDirectory } from '../utils/directory'

export const PROJECT_TEMPLATES = [
  { value: 'advanced-project', title: 'An advanced TypeScript project with multiple examples and best practices (recommended)' },
  { value: 'advanced-project-js', title: 'An advanced JavaScript project with multiple examples and best practices' },
  { value: 'boilerplate-project', title: 'A boilerplate TypeScript project with basic config' },
  { value: 'boilerplate-project-js', title: 'A boilerplate JavaScript project with basic config' },
]

export function askInitializeProject (onCancel: any): Promise<{ initializeProject: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'initializeProject',
    message: 'It looks like you are already in a project, would you like to initialize?',
    initial: true,
  }, { onCancel })
}

export function askProjectDirectory (onCancel: any): Promise<{ projectDirectory: string }> {
  return prompts({
    type: 'text',
    name: 'projectDirectory',
    message: 'Where do you want to create your new project?',
    initial: generateProjectName(),
    format: val => path.resolve(val),
    validate (dirName) {
      const absolutePath = path.resolve(dirName)
      if (!isValidProjectDirectory(absolutePath)) {
        return `"${chalk.bold(absolutePath)}" is not empty!`
      }
      return true
    },
  }, { onCancel })
}

export function askTemplate (onCancel: any): Promise<{ template: string }> {
  return prompts({
    type: 'select',
    name: 'template',
    message: 'Which template would you like to use for your new project?',
    choices: PROJECT_TEMPLATES,
  }, { onCancel })
}

export function askCreateInitialBrowserCheck (onCancel: any): Promise<{ createInitialBrowserCheck: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'createInitialBrowserCheck',
    message: 'Would you like to create a custom Playwright-based Browser Check to check a URL?',
    initial: true,
  }, { onCancel })
}

export function askUserWebsite (onCancel: any): Promise<{ userWebsite: string }> {
  return prompts({
    type: 'text',
    name: 'userWebsite',
    message: 'Please provide the URL of the site you want to check.',
  }, { onCancel })
}

export function askInstallDependencies (onCancel: any = () => true): Promise<{ installDependencies: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'installDependencies',
    message: 'Would you like to install NPM dependencies? (recommended)',
    initial: true,
  }, { onCancel })
}

export function askInitializeGit (onCancel: any = () => true): Promise<{ initializeGit: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'initializeGit',
    message: 'Would you like to initialize a new git repo? (optional)',
    initial: true,
  }, { onCancel })
}

export function askCopyPlaywrightProject (onCancel: any): Promise<{ shouldCopyPlaywrightConfig: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'shouldCopyPlaywrightConfig',
    message: 'Would you like to copy your Playwright settings to your Checkly config file?',
    initial: true,
  }, { onCancel })
}

export async function askPlaywrightConfigPath (
  candidates: string[],
  projectDir: string,
  onCancel: any,
): Promise<{ playwrightConfigPath: string | undefined }> {
  // Nothing to suggest, fallthrough to custom input.
  if (candidates.length === 0) {
    return askCustomPlaywrightConfigPath(projectDir, onCancel)
  }

  const CUSTOM_VALUE = '__custom__'
  const SKIP_VALUE = '__skip__'
  const choices = [
    ...candidates.map(c => ({
      title: `./${path.relative(projectDir, c)}`,
      value: c,
    })),
    { title: 'Custom path', value: CUSTOM_VALUE },
    { title: 'Skip', value: SKIP_VALUE },
  ]

  const { playwrightConfigPath } = await prompts({
    type: 'select',
    name: 'playwrightConfigPath',
    message: 'Which Playwright config file would you like to use?',
    choices,
    initial: 0,
  }, { onCancel })

  if (playwrightConfigPath === CUSTOM_VALUE) {
    return askCustomPlaywrightConfigPath(projectDir, onCancel)
  }

  if (playwrightConfigPath === SKIP_VALUE) {
    return { playwrightConfigPath: undefined }
  }

  return { playwrightConfigPath }
}

async function askCustomPlaywrightConfigPath (
  projectDir: string,
  onCancel: any,
): Promise<{ playwrightConfigPath: string | undefined }> {
  const { playwrightConfigPath } = await prompts({
    type: 'text',
    name: 'playwrightConfigPath',
    message: 'Enter the path to your Playwright config file:',
    validate (val: string) {
      const resolved = path.resolve(projectDir, val)
      if (!fs.existsSync(resolved)) {
        return `File not found: ${chalk.bold(resolved)}`
      }
      return true
    },
    format: (val: string) => path.resolve(projectDir, val),
  }, { onCancel })

  return { playwrightConfigPath }
}
