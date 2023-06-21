/* eslint-disable */
import { CheckGroup } from 'checkly/constructs'
import { privateLocation } from './private-location.check'
export const group = new CheckGroup('my-group-1', {
  name: 'My Group 1',
  activated: false,
  locations: ['us-east-1'],
  privateLocations: [privateLocation],
})
