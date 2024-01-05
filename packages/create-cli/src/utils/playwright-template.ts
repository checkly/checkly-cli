const playwrightConfigTemplate = `
const playwrightConfig = {
  playwrightConfig: {
  {{#timeout}}
    timeout: {{.}},
  {{/timeout}}
  {{#use}}
    use: {
      {{#baseURL}}
      baseURL: '{{.}}',
      {{/baseURL}}
      {{#colorScheme}}
      colorScheme: '{{.}}',
      {{/colorScheme}}
      {{#geolocation}}
      geolocation: {
       {{#longitude}}
       longitude: {{.}},
       {{/longitude}}
       {{#latitude}}
       latitude: {{.}},
       {{/latitude}}
       {{#accuracy}}
       accuracy: {{.}},
       {{/accuracy}}
      },
      {{/geolocation}}
      {{#locale}}
      locale: '{{.}}',
      {{/locale}}
      {{#if permissions}}
      permissions: [{{#permissions}}'{{.}}',{{/permissions}}],
      {{/if}}
      {{#timezoneId}}
      timezoneId: '{{.}}',
      {{/timezoneId}}
      {{#viewport}}
      viewport: {
        {{#width}}
        width: {{.}},
        {{/width}}
        {{#height}}
        height: {{.}},
        {{/height}}
      },
      {{/viewport}}
      {{#deviceScaleFactor}}
      deviceScaleFactor: {{.}},
      {{/deviceScaleFactor}}
      {{#hasTouch}}
      hasTouch: {{.}},
      {{/hasTouch}}
      {{#isMobile}}
      isMobile: {{.}},
      {{/isMobile}}
      {{#javaScriptEnabled}}
      javaScriptEnabled: {{.}},
      {{/javaScriptEnabled}}
      {{#acceptDownloads}}
      acceptDownloads: {{.}},
      {{/acceptDownloads}}
      {{#extraHTTPHeaders}}
      extraHTTPHeaders: {
        {{#each .}}
        {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/extraHTTPHeaders}}
      {{#httpCredentials}}
      httpCredentials: {
        {{#each .}}
        {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/httpCredentials}}
      {{#ignoreHTTPSErrors}}
      ignoreHTTPSErrors: {{.}},
      {{/ignoreHTTPSErrors}}
      {{#offline}}
      offline: {{.}},
      {{/offline}}
      {{#actionTimeout}}
      actionTimeout: {{.}},
      {{/actionTimeout}}
      {{#navigationTimeout}}
      navigationTimeout: {{.}},
      {{/navigationTimeout}}
      {{#testIdAttribute}}
      testIdAttribute: '{{.}}',
      {{/testIdAttribute}}
      {{#launchOptions}}
      launchOptions: {
        {{#each .}}
        {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/launchOptions}}
      {{#contextOptions}}
      contextOptions: {
        {{#each .}}
        {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/contextOptions}}
      {{#bypassCSP}}
      bypassCSP: '{{.}}',
      {{/bypassCSP}}
    },
  {{/use}}
  {{#expect}}
    expect: {
      {{#timeout}}
      timeout: {{.}},
      {{/timeout}}
      {{#toHaveScreenshot}}
      toHaveScreenshot: {
        {{#each .}}
         {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/toHaveScreenshot}}
      {{#toMatchSnapshot}}
      toMatchSnapshot: {
        {{#each .}}
        {{@key}}: {{{parse this}}},
        {{/each}}
      },
      {{/toMatchSnapshot}}
    },
  {{/expect}}
 }
}
`
export default playwrightConfigTemplate
