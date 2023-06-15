/* eslint-disable */
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { Dashboard } from 'checkly/constructs'
new Dashboard('dashboard-1', {
  header: 'My dashboard',
  tags: ['prod', 'api'],
  customUrl: `status-test-cli-${uuidv4()}`,
  customCSS: {
    entrypoint: path.join(__dirname, 'dashboard.css'),
  }
})