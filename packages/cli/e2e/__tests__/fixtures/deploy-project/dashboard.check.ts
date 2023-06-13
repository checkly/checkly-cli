/* eslint-disable */
import path from 'path'
import { Dashboard } from 'checkly/constructs'
new Dashboard('dashboard-1', {
  header: 'My dashboard',
  tags: ['prod', 'api'],
  customUrl: 'status-cli',
  customCSS: {
    entrypoint: path.join(__dirname, 'dashboard.css'),
  }
})