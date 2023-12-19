import { CheckProps } from './check'

export type Use = {
    baseURL?: string,
    colorScheme?: string,
    geolocation?: {
        longitude?: number,
        latitude?: number
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
}

export type Expect = {
    timeout?: number
}

export type PlaywrightConfig = {
    use?: Use,
    expect?: Expect,
    timeout?: number
}

export interface BrowserPlaywrightDefaults extends CheckProps {
    playwrightConfig?: PlaywrightConfig
}
