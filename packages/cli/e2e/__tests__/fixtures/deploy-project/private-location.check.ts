/* eslint-disable */
import { PrivateLocation } from 'checkly/constructs'
export const privateLocation = new PrivateLocation('private-location-1', {
  name: 'My Private Location',
  icon: 'squirrel',
  slugName: process.env.PRIVATE_LOCATION_SLUG_NAME!
})
