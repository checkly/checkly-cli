const mockChecksListResponse = [
  {
    id: '92b98ec6-15bd-4729-945a-de1125659271',
    checkType: 'API',
    name: 'API Check',
    frequency: 10,
    frequencyOffset: 20,
    activated: true,
    muted: false,
    shouldFail: false,
    alertChannels: null,
    locations: [],
    script: null,
    created_at: '2021-09-07T14:48:33.196Z',
    updated_at: '2021-09-20T14:28:45.045Z',
    environmentVariables: null,
    doubleCheck: true,
    tags: [],
    sslCheck: true,
    setupSnippetId: null,
    tearDownSnippetId: null,
    localSetupScript: null,
    localTearDownScript: null,
    alertSettings: [],
    useGlobalAlertSettings: true,
    degradedResponseTime: 10000,
    maxResponseTime: 20000,
    groupId: null,
    groupOrder: null,
    runtimeId: null,
    request: [],
    alertChannelSubscriptions: []
  },
  {
    id: '2a2e8a84-8478-4fd6-8b3f-efbc659527fc',
    checkType: 'BROWSER',
    name: 'Runtime Ver',
    frequency: 10,
    frequencyOffset: 75,
    activated: false,
    muted: false,
    shouldFail: false,
    alertChannels: null,
    locations: [],
    script:
      'const { chromium } = require("playwright")\n' +
      'const expect = require("expect")\n' +
      '\n' +
      '// Start a browser session\n' +
      'const browser = await chromium.launch()\n' +
      'const page = await browser.newPage()\n' +
      '\n' +
      '// Print chrome version\n' +
      'console.log(await browser.version())\n' +
      '\n' +
      '// Close the session\n' +
      'await browser.close()',
    created_at: '2021-06-29T13:56:52.060Z',
    updated_at: '2021-07-30T16:28:26.498Z',
    environmentVariables: [],
    doubleCheck: true,
    tags: [],
    sslCheck: true,
    setupSnippetId: null,
    tearDownSnippetId: null,
    localSetupScript: null,
    localTearDownScript: null,
    alertSettings: [Object],
    useGlobalAlertSettings: true,
    degradedResponseTime: 15000,
    maxResponseTime: 30000,
    groupId: null,
    groupOrder: null,
    runtimeId: '2020.01',
    alertChannelSubscriptions: []
  }
]

const mockChecksInfoResponse = {
  id: '92b98ec6-15bd-4729-945a-de1125659271',
  checkType: 'API',
  name: 'API Check',
  frequency: 10,
  frequencyOffset: 20,
  activated: true,
  muted: false,
  shouldFail: false,
  alertChannels: null,
  locations: [],
  script: null,
  created_at: '2021-09-07T14:48:33.196Z',
  updated_at: '2021-09-20T14:28:45.045Z',
  environmentVariables: null,
  doubleCheck: true,
  tags: [],
  sslCheck: true,
  setupSnippetId: null,
  tearDownSnippetId: null,
  localSetupScript: null,
  localTearDownScript: null,
  alertSettings: [],
  useGlobalAlertSettings: true,
  degradedResponseTime: 10000,
  maxResponseTime: 20000,
  groupId: null,
  groupOrder: null,
  runtimeId: null,
  request: [],
  alertChannelSubscriptions: []
}

const mockProjectsResponse = [
  {
    id: 7,
    name: 'test project 3',
    repoUrl: ' ',
    activated: false,
    muted: false,
    state: {},
    accountId: 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
    created_at: '2021-07-28T17:36:07.718Z',
    updated_at: null
  },
  {
    id: 8,
    name: 'test project 32',
    repoUrl: ' ',
    activated: false,
    muted: false,
    state: {},
    accountId: 'e46106d8-e382-4d1f-8182-9d63983ed6d4',
    created_at: '2021-07-28T17:38:38.959Z',
    updated_at: null
  }
]

module.exports = {
  mockChecksListResponse,
  mockChecksInfoResponse,
  mockProjectsResponse
}
