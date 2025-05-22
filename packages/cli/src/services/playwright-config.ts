import * as path from 'node:path'

function toAbsolutePath(dir: string, file: string) {
  return path.resolve(dir, file)
}

function parseBrowsers(config: any) {
  const browsers = new Set<string>()
  const browserKeywords = ['browserName', 'defaultBrowserType', 'channel']
  for (const browserKeyword of browserKeywords) {
    if (config?.use?.[browserKeyword]) {
      browsers.add(config?.use[browserKeyword])
    }
  }
  return browsers
}

function buildSnapshotTemplates(config: PlaywrightConfig|PlaywrightProject, filePath: string) {
  const fileRelativePath = path.relative(config.testDir, filePath)
  const parsed = path.parse(fileRelativePath)
  return Array.from(config.snapshotTemplates).map(template => {
    return template
            .replace(/\{(.)?testDir\}/g, '$1' + config.testDir)
            .replace(/\{(.)?snapshotDir\}/g, '$1' + config.snapshotDir)
            .replace(/\{(.)?testFileDir\}/g, '$1' + parsed.dir)
            .replace(/\{(.)?platform\}/g, '$1' + config.platform)
            .replace(/\{(.)?projectName\}/g, config.projectName)
            .replace(/\{(.)?testName\}/g, '$1' + '*')
            .replace(/\{(.)?testFileName\}/g, '$1' + parsed.base)
            .replace(/\{(.)?testFilePath\}/g, '$1' + fileRelativePath)
            .replace(/\{(.)?arg\}/g, '$1' + '*')
            .replace(/\{(.)?ext\}/g, '$1' +  '.*');
  })
}

const DEFAULT_SNAPSHOT_TEMPLATE = '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}'

export class PlaywrightConfig {
  projectName: string
  configFilePath: string
  platform: string
  testDir: string
  snapshotDir: string
  testMatch: Set<string | RegExp>
  snapshotTemplates: Set<string>
  browsers: Set<string>
  projects?: PlaywrightProject[]
  files: Set<string>

  constructor(filePath: string, playwrightConfig: any) {
    const dir = path.dirname(filePath)
    this.projectName = ''
    this.platform = 'linux'
    this.testDir = playwrightConfig.testDir ? toAbsolutePath(dir, playwrightConfig.testDir) : dir
    this.snapshotDir = playwrightConfig.snapshotDir ? toAbsolutePath(dir, playwrightConfig.snapshotDir) : this.testDir
    this.files = new Set<string>()
    this.snapshotTemplates = new Set<string>()
    const testMatch = playwrightConfig.testMatch ?? ['**/*.@(spec|test).?(c|m)[jt]s?(x)']
    this.testMatch = new Set<string | RegExp>(Array.isArray(testMatch) ? testMatch : [testMatch])
    this.configFilePath = filePath
    const fileDefinitions = ['tsconfig', 'globalSetup', 'globalTeardown']
    for (const fileDefinition of fileDefinitions) {
      const definition = playwrightConfig[fileDefinition]
      if (!definition) {
        continue
      }
      if (Array.isArray(definition)) {
        definition.forEach((file: string) => this.files.add(file))
      } else {
        this.files.add(definition)
      }
    }

    if (playwrightConfig.snapshotPathTemplate) {
      this.snapshotTemplates.add(playwrightConfig.snapshotPathTemplate)
    }

    const expect = playwrightConfig.expect
    if (expect?.toHaveScreenshot?.pathTemplate) {
      this.snapshotTemplates.add(expect.toHaveScreenshot.pathTemplate)
    }
    if (expect?.toMatchAriaSnapshot?.pathTemplate) {
      this.snapshotTemplates.add(expect.toMatchAriaSnapshot.pathTemplate)
    }
    if (this.snapshotTemplates.size === 0) {
      this.snapshotTemplates.add(DEFAULT_SNAPSHOT_TEMPLATE);
    }

    this.browsers = parseBrowsers(playwrightConfig)

    if (playwrightConfig.projects?.length) {
      this.projects = playwrightConfig.projects.map((project: any) => new PlaywrightProject(dir, this, project))
    }
  }

  getFiles() {
    const files = new Set<string>(this.files)
    this.projects?.forEach(project => project.files.forEach(file => files.add(file)))
    return Array.from(files)
  }

  getBrowsers() {
    const browsers = new Set<string>(this.browsers)
    this.projects?.forEach(project => project.browsers.forEach(browser => browsers.add(browser)))
    if (browsers.size === 0) {
      // Add the default browser
      browsers.add('chromium')
    }
    return Array.from(browsers)
  }

  addFiles(...files: string[]) {
    files.forEach(this.files.add, this.files)
  }

  getSnapshotPath(filePath: string) {
    return buildSnapshotTemplates(this, filePath)
  }
}

export class PlaywrightProject {
  projectName: string
  platform: string
  testDir: string
  snapshotDir: string
  testMatch: Set<string | RegExp>
  expect: any
  files: Set<string>
  snapshotTemplates: Set<string>
  browsers: Set<string>
  constructor(dir: string, playwrightConfig: any, playwrightProject: any) {
    this.projectName = playwrightProject.name
    this.platform = 'linux'
    this.testDir = playwrightProject.testDir ?  toAbsolutePath(dir, playwrightProject.testDir): playwrightConfig.testDir
    this.snapshotDir = playwrightProject.snapshotDir ? toAbsolutePath(dir, playwrightProject.snapshotDir):  (playwrightConfig.snapshotDir ?? this.testDir)
    this.files = new Set<string>()
    this.snapshotTemplates = new Set<string>()
    const testMatch = playwrightProject.testMatch ?? Array.from(playwrightConfig.testMatch)
    this.testMatch = new Set<string | RegExp>(Array.isArray(testMatch) ? testMatch : [testMatch])

    if (playwrightProject.snapshotPathTemplate) {
      this.snapshotTemplates.add(playwrightProject.snapshotPathTemplate)
    }

    // Check if the project overrides the global expect field
    const expect = playwrightProject.expect ?? playwrightConfig.expect
    if (expect?.toHaveScreenshot?.pathTemplate) {
      this.snapshotTemplates.add(expect.toHaveScreenshot.pathTemplate)
    }
    if (expect?.toMatchAriaSnapshot?.pathTemplate) {
      this.snapshotTemplates.add(expect.toMatchAriaSnapshot.pathTemplate)
    }
    if (this.snapshotTemplates.size === 0) {
      this.snapshotTemplates.add(DEFAULT_SNAPSHOT_TEMPLATE);
    }

    this.browsers = parseBrowsers(playwrightProject)
  }

  getSnapshotPath(filePath: string) {
    return buildSnapshotTemplates(this, filePath)
  }

  addFiles(...files: string[]){
    files.forEach(this.files.add, this.files)
  }
}
