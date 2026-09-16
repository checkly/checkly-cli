import { ApiCheck, AssertionBuilder } from 'checkly/constructs'

new ApiCheck('check', {
  name: 'Treat response body as text check',
  request: {
    method: 'GET',
    url: 'https://binary-labelled-text.example.test',
    treatResponseBodyAsText: true,
    assertions: [
      AssertionBuilder.textBody().contains('OK'),
    ],
  },
})
