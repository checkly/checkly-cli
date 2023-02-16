import * as path from 'path'
import { BrowserCheck } from '@checkly/cli/constructs'
import { smsChannel, emailChannel } from '../alert-channels'
const alertChannels = [smsChannel, emailChannel]

const browserCheck1 = new BrowserCheck('homepage-browser-check-1', {
  name: 'Homepage',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, 'homepage.spec.ts'),
  },
})

const browserCheck2 = new BrowserCheck('404-browser-check-1', {
  name: '404 page',
  alertChannels,
  code: {
    entrypoint: path.join(__dirname, '404.spec.ts'),
  },
})

const browserCheck3 = new BrowserCheck('secret-browser-check', {
  name: 'Show SECRET_ENV value',
  activated: false,
  code: {
    content: 'console.info(process.env.SECRET_ENV);',
  },
})
