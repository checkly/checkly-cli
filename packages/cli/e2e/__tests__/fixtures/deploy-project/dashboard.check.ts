/* eslint-disable */
import { Dashboard } from 'checkly/constructs'
new Dashboard('dashboard-1', {
  header: 'My dashboard',
  tags: ['prod', 'api'],
  customUrl: 'status-cli',
})