/**
 * Ref: https://playwright.dev/docs/network#http-proxy
 */
type HttpProxy = {
    server: string,
    username?: string,
    password?: string,
}

export type Use = {
    baseURL?: string,
    colorScheme?: string,
    geolocation?: {
        longitude?: number,
        latitude?: number,
        accuracy?: number,
    },
    locale?: string,
    permissions?: string[],
    timezoneId?: string,
    viewport?: {
        width?: number,
        height?: number,
    },
    deviceScaleFactor?: number,
    hasTouch?: boolean,
    isMobile?: boolean,
    javaScriptEnabled?: boolean,
    acceptDownloads?: boolean,
    extraHTTPHeaders?: object,
    httpCredentials?: object,
    ignoreHTTPSErrors?: boolean,
    offline?: boolean,
    actionTimeout?: number,
    navigationTimeout?: number,
    testIdAttribute?: string,
    launchOptions?: object,
    contextOptions?: object,
    bypassCSP?: boolean,
    userAgent?: string,
    proxy?: HttpProxy,
}

export type Expect = {
    timeout?: number,
    toHaveScreenshot?: object,
    toMatchSnapshot?: object,
}

export type PlaywrightConfig = {
    use?: Use,
    expect?: Expect,
    timeout?: number
}
