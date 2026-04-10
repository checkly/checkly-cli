/* eslint-disable no-new */

import { StatusPage, StatusPageService } from 'checkly/constructs'
import { v4 as uuidv4 } from 'uuid'

export const fooService = new StatusPageService('foo-service', {
  name: 'Foo',
})

export const barService = new StatusPageService('bar-service', {
  name: 'Bar',
})

new StatusPage('test-page-1', {
  name: 'Test Status Page 1',
  url: `cli-e2e-test-1-${uuidv4()}`,
  cards: [{
    name: 'Card 1',
    services: [
      fooService,
      barService,
    ],
  }],
})
