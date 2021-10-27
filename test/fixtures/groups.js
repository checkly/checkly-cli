const mockListResponse = [
  {
    id: 1,
    name: 'group-1',
    concurrency: 1,
    activated: true,
    muted: false,
    locations: ['us-east-1'],
  },
  {
    id: 2,
    name: 'group-2',
    concurrency: 1,
    activated: true,
    muted: false,
    locations: ['sa-east-1', 'af-south-1', 'eu-west-1', 'eu-central-1'],
  },
]

const mockInfoResponse = {
  id: 1,
  name: 'group-1',
  concurrency: 1,
  apiCheckDefaults: {
    url: '',
    headers: [],
    queryParameters: [],
    assertions: [],
  },
  browserCheckDefaults: {},
  alertSettings: {},
  environmentVariables: [],
  setupSnippetId: null,
  tearDownSnippetId: null,
  localSetupScript: null,
  localTearDownScript: null,
  activated: true,
  muted: false,
  useGlobalAlertSettings: true,
  doubleCheck: true,
  locations: ['us-east-1'],
  tags: [],
  created_at: '2021-10-19T17:57:59.345Z',
  updated_at: null,
  runtimeId: null,
  alertChannelSubscriptions: [],
}

module.exports = {
  mockInfoResponse,
  mockListResponse,
}
