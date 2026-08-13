import { ApiCheck } from 'checkly/constructs'

new ApiCheck('dashboard-intent', {
  name: 'Dashboard intent',
  intent: {
    goal: 'Verify that authenticated users can open the dashboard.',
    constraints: [
      {
        type: 'REQUIRED_OUTCOME',
        statement: 'The dashboard displays the account overview.',
      },
      {
        type: 'MUST_PRESERVE',
        statement: 'Do not weaken the authentication assertion.',
      },
    ],
  },
  request: {
    method: 'GET',
    url: 'https://example.com/api/dashboard',
  },
})
