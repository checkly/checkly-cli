/* eslint no-console: 'off' */
import path from 'node:path'

import prompts from 'prompts'
import { describe, it, expect, afterEach, vi } from 'vitest'

import {
  PROJECT_TEMPLATES,
  askInitializeProject,
  askProjectDirectory,
  askTemplate,
  askCreateInitialBrowserCheck,
  askInstallDependencies,
  askInitializeGit,
} from '../prompts'
import * as directoryUtils from '../../utils/directory'

const generateProjectName = vi.spyOn(directoryUtils, 'generateProjectName').mockReturnValue('generated-project-name')

describe('prompts', () => {
  const onCancel = vi.fn()

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should ask for confirmation (all confirm questions)', async () => {
    const promptsQuestions = [
      askInitializeProject, askCreateInitialBrowserCheck,
      askInstallDependencies, askInitializeGit,
    ]

    for await (const question of promptsQuestions) {
      prompts.inject([true, false, new Error()])
      const firstAnswer = await question(onCancel)
      const secondAnswer = await question(onCancel)
      const thirdAnswer = await question(onCancel)

      // questions returns different property names, check the one returned
      expect(Object.values(firstAnswer)[0]).toBe(true)
      expect(Object.values(secondAnswer)[0]).toBe(false)
      expect(Object.values(thirdAnswer)[0]).toBeUndefined()
    }
    expect(onCancel).toBeCalledTimes(promptsQuestions.length)
  })

  it('should ask for project directory', async () => {
    prompts.inject(['dummy-project', '.', new Error()])
    const { projectDirectory: firstAnswer } = await askProjectDirectory(onCancel)
    const { projectDirectory: secondAnswer } = await askProjectDirectory(onCancel)
    const { projectDirectory: thirdAnswer } = await askProjectDirectory(onCancel)

    expect(firstAnswer).toBe(path.resolve('dummy-project'))
    expect(secondAnswer).toBe(path.resolve('.'))
    expect(thirdAnswer).toBeUndefined()
    expect(generateProjectName).toBeCalledTimes(3)
    expect(onCancel).toBeCalledTimes(1)
  })

  it('should ask to select a template', async () => {
    const availableTemplates = PROJECT_TEMPLATES.map(t => t.value)
    for await (const template of availableTemplates) {
      prompts.inject([template, new Error()])
      const { template: selectedTemplate } = await askTemplate(onCancel)
      const { template: cancelled } = await askTemplate(onCancel)

      expect(selectedTemplate).toBe(template)
      expect(cancelled).toBeUndefined()
    }
    expect(onCancel).toBeCalledTimes(availableTemplates.length)
  })
})
