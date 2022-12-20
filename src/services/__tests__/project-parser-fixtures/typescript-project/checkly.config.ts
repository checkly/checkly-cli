import { BrowserCheck } from '../../../../constructs'


export default async function createCheck () {
  return new BrowserCheck('ts-check', {
    name: 'typescript-check',
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
    script: '// check script'
  })
}
