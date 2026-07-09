import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import {
  getGitInformation,
  pathToPosix,
  isFileSync,
} from '../util.js'

const ENV_KEYS = [
  'CHECKLY_REPO_SHA',
  'CHECKLY_REPO_URL',
  'CHECKLY_REPO_BRANCH',
  'CHECKLY_GITHUB_REPORT',
  'CHECKLY_GITHUB_CHECK_NAME',
  'CHECKLY_GITHUB_REPOSITORY',
  'CHECKLY_GITHUB_SHA',
  'CHECKLY_GITHUB_RUN_ID',
  'CHECKLY_GITHUB_RUN_ATTEMPT',
  'CHECKLY_GITHUB_WORKFLOW',
  'CHECKLY_GITHUB_JOB',
  'CHECKLY_GITHUB_EVENT_NAME',
  'CHECKLY_GITHUB_REF',
  'CHECKLY_GITHUB_HEAD_REF',
  'CHECKLY_GITHUB_BASE_REF',
  'CHECKLY_GITHUB_SERVER_URL',
] as const

describe('util', () => {
  const originalEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  describe('pathToPosix()', () => {
    it('should convert Windows paths', () => {
      expect(pathToPosix('src\\__checks__\\my_check.spec.ts', '\\'))
        .toEqual('src/__checks__/my_check.spec.ts')
    })

    it('should have no effect on linux paths', () => {
      expect(pathToPosix('src/__checks__/my_check.spec.ts'))
        .toEqual('src/__checks__/my_check.spec.ts')
    })
  })

  describe('isFileSync()', () => {
    it('should determine if a file is present at a given path', () => {
      expect(isFileSync(path.join(__dirname, '/fixtures/this-is-a-file.ts'))).toBeTruthy()
    })
    it('should determine if a file is not present at a given path', () => {
      expect(isFileSync('some random string')).toBeFalsy()
    })
  })

  describe('getGitInformation()', () => {
    it('should not include GitHub metadata by default', () => {
      process.env.CHECKLY_REPO_SHA = 'abc123'
      process.env.CHECKLY_REPO_URL = 'https://github.com/checkly/demo'
      process.env.CHECKLY_REPO_BRANCH = 'main'

      expect(getGitInformation()).toEqual(expect.objectContaining({
        commitId: 'abc123',
        repoUrl: 'https://github.com/checkly/demo',
        branchName: 'main',
      }))
      expect(getGitInformation()).not.toHaveProperty('github')
    })

    it('should accept common truthy values for CHECKLY_GITHUB_REPORT', () => {
      process.env.CHECKLY_GITHUB_SHA = 'abc123def456'
      for (const value of ['true', 'TRUE', 'True', '1', ' true ']) {
        process.env.CHECKLY_GITHUB_REPORT = value
        expect(getGitInformation()).toHaveProperty('github')
      }
      for (const value of ['false', '0', 'yes', 'on', '']) {
        process.env.CHECKLY_GITHUB_REPORT = value
        expect(getGitInformation()).not.toHaveProperty('github')
      }
    })

    it('should include GitHub Actions metadata when Checkly GitHub reporting is enabled', () => {
      process.env.CHECKLY_GITHUB_REPORT = 'true'
      process.env.CHECKLY_GITHUB_CHECK_NAME = 'Checkly PR code checks'
      process.env.CHECKLY_GITHUB_REPOSITORY = 'checkly/playwright-reporter-demo'
      process.env.CHECKLY_GITHUB_SHA = 'abc123def456'
      process.env.CHECKLY_GITHUB_RUN_ID = '123456'
      process.env.CHECKLY_GITHUB_RUN_ATTEMPT = '2'
      process.env.CHECKLY_GITHUB_WORKFLOW = 'Checkly'
      process.env.CHECKLY_GITHUB_JOB = 'validate'
      process.env.CHECKLY_GITHUB_EVENT_NAME = 'pull_request'
      process.env.CHECKLY_GITHUB_REF = 'refs/pull/4/merge'
      process.env.CHECKLY_GITHUB_HEAD_REF = 'herve/test-checkly-action'
      process.env.CHECKLY_GITHUB_BASE_REF = 'main'
      process.env.CHECKLY_GITHUB_SERVER_URL = 'https://github.com'

      expect(getGitInformation()).toEqual(expect.objectContaining({
        commitId: 'abc123def456',
        repoUrl: 'https://github.com/checkly/playwright-reporter-demo',
        github: {
          reporting: true,
          checkName: 'Checkly PR code checks',
          repository: 'checkly/playwright-reporter-demo',
          sha: 'abc123def456',
          runId: '123456',
          runAttempt: '2',
          workflow: 'Checkly',
          job: 'validate',
          eventName: 'pull_request',
          ref: 'refs/pull/4/merge',
          headRef: 'herve/test-checkly-action',
          baseRef: 'main',
          serverUrl: 'https://github.com',
        },
      }))
    })
  })
})
