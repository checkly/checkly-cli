import { PlaywrightConfig, Use, Expect } from '../constructs/browser-defaults'
import * as JSON5 from 'json5'

export default class PlaywrightConfigTemplate {
  playwrightConfig: PlaywrightConfig

  constructor ({ use, expect, timeout }: any) {
    this.playwrightConfig = {}
    if (use) {
      this.playwrightConfig.use = this.getUseParams(use)
    }
    if (expect) {
      this.playwrightConfig.expect = this.getExpectParams(expect)
    }
    this.playwrightConfig.timeout = timeout
  }

  private getUseParams (use: any): Use {
    return {
      baseURL: use.baseURL,
      colorScheme: use.colorScheme,
      geolocation: use.geolocation,
      locale: use.locale,
      permissions: use.permissions,
      timezoneId: use.timezoneId,
      viewport: use.viewport,
      deviceScaleFactor: use.deviceScaleFactor,
      hasTouch: use.hasTouch,
      isMobile: use.isMobile,
      javaScriptEnabled: use.javaScriptEnabled,
      acceptDownloads: use.acceptDownloads,
      extraHTTPHeaders: use.extraHTTPHeaders,
      httpCredentials: use.httpCredentials,
      ignoreHTTPSErrors: use.ignoreHTTPSErrors,
      offline: use.offline,
      actionTimeout: use.actionTimeout,
      navigationTimeout: use.navigationTimeout,
      testIdAttribute: use.testIdAttribute,
      launchOptions: use.launchOptions,
      contextOptions: use.contextOptions,
      bypassCSP: use.bypassCSP,
    }
  }

  private getExpectParams (expect: any): Expect {
    return {
      timeout: expect.timeout,
      toHaveScreenshot: expect.toHaveScreenshot,
      toMatchSnapshot: expect.toMatchSnapshot,
    }
  }

  getConfigTemplate () {
    return `const playwrightConfig = ${JSON5.stringify(this, { space: 2 })}`
  }
}
