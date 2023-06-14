/* eslint-disable */
import { v4 as uuidv4 } from 'uuid'
import { PrivateLocation } from 'checkly/constructs'
export const privateLocation = new PrivateLocation('private-location-1', {
  name: 'My Private Location',
  icon: 'squirrel',
  slugName: `private-location-cli-${uuidv4()}`
})
