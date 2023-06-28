import * as path from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { generateProjectName, isValidProjectDirectory } from '../utils/directory.js'

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
    choices: [
      { value: 'advanced-project', title: 'An advanced TypeScript project with multiple examples and best practices (recommended)' },
      { value: 'advanced-project-js', title: 'An advanced JavaScript project with multiple examples and best practices' },
      { value: 'boilerplate-project', title: 'A boilerplate TypeScript project with basic config' },
      { value: 'boilerplate-project-js', title: 'A boilerplate JavaScript project with basic config' },
    ],
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

export function askInstallDependencies (): Promise<{ installDependencies: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'installDependencies',
    message: 'Would you like to install NPM dependencies? (recommended)',
    initial: true,
  }, { onCancel: () => true })
}

export function askInitializeGit (): Promise<{ initializeGit: boolean }> {
  return prompts({
    type: 'confirm',
    name: 'initializeGit',
    message: 'Would you like to initialize a new git repo? (optional)',
    initial: true,
  }, { onCancel: () => true })
}
