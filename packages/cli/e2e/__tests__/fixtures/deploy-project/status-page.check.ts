/* eslint-disable no-new */

import { StatusPage, StatusPageService } from 'checkly/constructs'

const fooService = new StatusPageService('foo-service', {
  name: 'Foo',
})

const barService = new StatusPageService('bar-service', {
  name: 'Bar',
})

new StatusPage('test-page-1', {
  name: 'Test Status Page 1',
  url: 'checkly-internal-test-status-page-18671',
  cards: [{
    name: 'Card 1',
    services: [
      fooService,
      barService,
    ],
  }],
})
