import { realpathSync } from 'node:fs'
import * as path from 'node:path'

/**
 * Resolves a config-relative path and canonicalizes it through any symlinks.
 *
 * Canonicalizing here — at construction, for every path the config names — is
 * load-bearing. Test files are found by globbing with testDir as the working
 * directory, and glob returns nothing at all when that directory is a symlink
 * (as it is when testDir points into node_modules under pnpm). Snapshot
 * patterns are then built by mixing testDir, snapshotDir and the discovered
 * file paths; if those lived in different namespaces — one spelled through a
 * link, another resolved — the arithmetic produces `..`-laden glob patterns
 * that match nothing. Everything the config names must therefore resolve into
 * the one canonical namespace.
 *
 * A path that does not exist is kept as spelled; there is nothing to resolve.
 */
function canonicalize (absolute: string) {
  try {
    return realpathSync(absolute)
  } catch {
    return absolute
  }
}

function parseBrowsers (config: any) {
  const browsers = new Set<string>()
  const browserKeywords = ['browserName', 'defaultBrowserType', 'channel']
  for (const browserKeyword of browserKeywords) {
    if (config?.use?.[browserKeyword]) {
      browsers.add(config?.use[browserKeyword])
    }
  }
  return browsers
}

function buildSnapshotTemplates (config: PlaywrightConfig | PlaywrightProject, filePath: string) {
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
      .replace(/\{(.)?ext\}/g, '$1' + '.*')
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
  /**
   * The paths this config names, keyed by the exact spelling the config uses
   * (resolved against the config directory, but not through symlinks), with the
   * canonical path as the value. The canonicalized properties above are what
   * discovery uses; the spellings are what the config file will still say when
   * it runs from the extracted bundle. Any symlink a spelling traverses must
   * therefore exist in the bundle too, or the reference resolves to nothing
   * there — the bundler walks these to find which links to carry. And when a
   * spelling's canonical path leaves the bundle root, the spelled-to-canonical
   * pair is what lets discovery fall back to bundling at the spelling.
   */
  referencedPaths: Map<string, string>

  constructor (filePath: string, playwrightConfig: any) {
    const dir = path.dirname(filePath)
    this.projectName = ''
    this.platform = 'linux'
    this.referencedPaths = new Map<string, string>()
    this.testDir = this.reference(dir, playwrightConfig.testDir ?? '.')
    this.snapshotDir = playwrightConfig.snapshotDir ? this.reference(dir, playwrightConfig.snapshotDir) : this.testDir
    this.files = new Set<string>()
    this.snapshotTemplates = new Set<string>()
    const testMatch = playwrightConfig.testMatch ?? ['**/*.@(spec|test).?(c|m)[jt]s?(x)']
    this.testMatch = new Set<string | RegExp>(Array.isArray(testMatch) ? testMatch : [testMatch])
    // The config's own location is a spelled reference like any other: the
    // check runs it by this spelling, and its content must live in the same
    // canonical namespace as everything the config names — a config reached
    // through a symlink would otherwise be archived beneath a carried link,
    // which forces the link out of the archive.
    this.configFilePath = this.reference(dir, path.basename(filePath))
    const fileDefinitions = ['tsconfig', 'globalSetup', 'globalTeardown']
    for (const fileDefinition of fileDefinitions) {
      const definition = playwrightConfig[fileDefinition]
      if (!definition) {
        continue
      }
      if (Array.isArray(definition)) {
        definition.forEach((file: string) => this.files.add(this.reference(dir, file)))
      } else {
        this.files.add(this.reference(dir, definition))
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
      this.snapshotTemplates.add(DEFAULT_SNAPSHOT_TEMPLATE)
    }

    this.browsers = parseBrowsers(playwrightConfig)

    if (playwrightConfig.projects?.length) {
      this.projects = playwrightConfig.projects.map((project: any) => new PlaywrightProject(dir, this, project))
    }
  }

  /** Records the spelled path and returns the canonical one. */
  reference (dir: string, file: string): string {
    const spelled = path.resolve(dir, file)
    const canonical = canonicalize(spelled)
    this.referencedPaths.set(spelled, canonical)
    return canonical
  }

  getBrowsers () {
    const browsers = new Set<string>(this.browsers)
    this.projects?.forEach(project => project.browsers.forEach(browser => browsers.add(browser)))
    if (browsers.size === 0) {
      // Add the default browser
      browsers.add('chromium')
    }
    return Array.from(browsers)
  }

  getSnapshotPath (filePath: string) {
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
  snapshotTemplates: Set<string>
  browsers: Set<string>
  // playwrightConfig is the enclosing PlaywrightConfig instance; typed loosely
  // because this constructor also probes raw-config fields on it that the class
  // does not carry (a long-standing quirk this change leaves as-is).
  constructor (dir: string, playwrightConfig: any, playwrightProject: any) {
    this.projectName = playwrightProject.name
    this.platform = 'linux'
    // Project-specific paths are recorded on the parent config, which is where
    // the bundler collects the spellings from.
    this.testDir = playwrightProject.testDir
      ? playwrightConfig.reference(dir, playwrightProject.testDir)
      : playwrightConfig.testDir
    this.snapshotDir = playwrightProject.snapshotDir
      ? playwrightConfig.reference(dir, playwrightProject.snapshotDir)
      : (playwrightConfig.snapshotDir ?? this.testDir)
    this.snapshotTemplates = new Set<string>()
    const testMatch = playwrightProject.testMatch ?? Array.from(playwrightConfig.testMatch)
    this.testMatch = new Set<string | RegExp>(Array.isArray(testMatch) ? testMatch : [testMatch])

    const snapshotPathTemplate = playwrightProject.snapshotPathTemplate ?? playwrightConfig.snapshotPathTemplate
    if (snapshotPathTemplate) {
      this.snapshotTemplates.add(snapshotPathTemplate)
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
      this.snapshotTemplates.add(DEFAULT_SNAPSHOT_TEMPLATE)
    }

    this.browsers = parseBrowsers(playwrightProject)
  }

  getSnapshotPath (filePath: string) {
    return buildSnapshotTemplates(this, filePath)
  }
}
