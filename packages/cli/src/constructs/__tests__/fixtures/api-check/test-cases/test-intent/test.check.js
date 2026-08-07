import { ApiCheck } from 'checkly/constructs'

new ApiCheck('dashboard-intent', {
  name: 'Dashboard intent',
  intent: {
    goal: 'Verify that authenticated users can open the dashboard.',
  },
  request: {
    method: 'GET',
    url: 'https://example.com/api/dashboard',
  },
})
