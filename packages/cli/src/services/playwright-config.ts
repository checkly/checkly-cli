export class PlaywrightConfig {
  projectName: string
  platform: string
  testDir: string
  snapshotDir: string
  files: Set<string | RegExp>
  snapshotTemplates: Set<string>
  browsers: Set<string>
  projects: PlaywrightProject[]

  constructor(playwrightConfig: any) {
    this.projectName = ''
    this.platform = 'linux'
    this.testDir = playwrightConfig.testDir ?? './'
    this.snapshotDir = playwrightConfig.snapshotDir ?? this.testDir
    this.files = new Set<string | RegExp>()
    this.snapshotTemplates = new Set<string>()
    this.browsers = new Set<string>()

    const fileDefinitions = ['tsconfig', 'testDir', 'testMatch', 'globalSetup', 'globalTeardown']
    for (const fileDefinition of fileDefinitions) {
      const definition = playwrightConfig[fileDefinition]
      if (!definition) {
        continue
      }
      if (Array.isArray(definition)) {
        definition.forEach((match: string | RegExp) => this.files.add(match))
      } else {
        this.files.add(definition)
      }
    }
    if (playwrightConfig.snapshotPathTemplate) {
      this.snapshotTemplates.add(playwrightConfig.snapshotPathTemplate)
    }
    if (playwrightConfig?.expect?.toHaveScreenshot?.pathTemplate) {
      this.snapshotTemplates.add(playwrightConfig.expect.toHaveScreenshot.pathTemplate)
    }
    if (playwrightConfig?.expect?.toMatchAriaSnapshot?.pathTemplate) {
      this.snapshotTemplates.add(playwrightConfig.expect.toMatchAriaSnapshot.pathTemplate)
    }
    if (this.snapshotTemplates.size === 0) {
      this.snapshotTemplates.add(`{snapshotDir}/{testFilePath}-snapshots`)
    }
    const browserKeywords = ['browserName', 'defaultBrowserType', 'channel']
    for (const browserKeyword of browserKeywords) {
      if (playwrightConfig?.use?.[browserKeyword]) {
        this.browsers.add(playwrightConfig?.use[browserKeyword])
      }
    }
    if (playwrightConfig.projects?.length) {
      this.projects = playwrightConfig.projects.map((project: any) => new PlaywrightProject(project))
    } else {
      this.projects = []
    }
  }

  getFiles() {
    const files = new Set<string | RegExp>(this.files)
    this.projects.forEach(project => project.files.forEach(file => files.add(file)))
    return Array.from(files)
  }

  getBrowsers() {
    const browsers = new Set<string>(this.browsers)
    this.projects.forEach(project => project.browsers.forEach(browser => browsers.add(browser)))
    if (browsers.size === 0) {
      // Add the default browser
      browsers.add('chromium')
    }
    return Array.from(browsers)
  }
}

export class PlaywrightProject {
  projectName: string
  platform: string
  testDir: string
  snapshotDir: string
  files: Set<string | RegExp>
  snapshotTemplates: Set<string>
  browsers: Set<string>
  constructor(playwrightProject: any) {
    this.projectName = playwrightProject.name
    this.platform = 'linux'
    this.testDir = playwrightProject.testDir ?? './'
    this.snapshotDir = playwrightProject.snapshotDir ?? this.testDir
    this.files = new Set<string | RegExp>()
    this.snapshotTemplates = new Set<string>()
    this.browsers = new Set<string>()

    const fileDefinitions = ['testDir', 'testMatch']
    for (const fileDefinition of fileDefinitions) {
      const definition = playwrightProject[fileDefinition]
      if (!definition) {
        continue
      }
      if (Array.isArray(definition)) {
        definition.forEach((match: string | RegExp) => this.files.add(match))
      } else {
        this.files.add(definition)
      }
    }
    if (playwrightProject.snapshotPathTemplate) {
      this.snapshotTemplates.add(playwrightProject.snapshotPathTemplate)
    }
    if (playwrightProject?.expect?.toHaveScreenshot?.pathTemplate) {
      this.snapshotTemplates.add(playwrightProject.expect.toHaveScreenshot.pathTemplate)
    }
    if (playwrightProject?.expect?.toMatchAriaSnapshot?.pathTemplate) {
      this.snapshotTemplates.add(playwrightProject.expect.toMatchAriaSnapshot.pathTemplate)
    }
    if (this.snapshotTemplates.size === 0) {
      this.snapshotTemplates.add(`{snapshotDir}/{testFilePath}-snapshots`)
    }
    const browserKeywords = ['browserName', 'defaultBrowserType', 'channel']
    for (const browserKeyword of browserKeywords) {
      if (playwrightProject?.use?.[browserKeyword]) {
        this.browsers.add(playwrightProject?.use[browserKeyword])
      }
    }
  }
}
