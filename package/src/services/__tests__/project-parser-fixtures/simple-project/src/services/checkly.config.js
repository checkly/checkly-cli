const { BrowserCheck } = require('../../../../../../constructs')

const browser = new BrowserCheck('check-2', {
    name: 'simple-check-2',
    muted: false,
    activated: true,
    doubleCheck: false,
    shouldFail: false,
    runtimeId: '2022.10',
    locations: ['eu-central-1'],
    frequency: 10,
    tags: [],
    environmentVariables: [],
    alertChannels: [],
    code: {
        content: 'console.log(1)'
    }  })