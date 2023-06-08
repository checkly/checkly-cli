/* eslint-disable */
import * as path from 'path'
import { BrowserCheck } from 'checkly/constructs'
import { group } from './group.check'

new BrowserCheck('homepage-browser-check', {
  name: 'Home page',
  group,
  code: {
    entrypoint: path.join(__dirname, 'homepage.test.ts')
  },
})