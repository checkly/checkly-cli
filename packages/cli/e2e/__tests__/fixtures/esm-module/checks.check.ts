import { BrowserCheck } from 'checkly/constructs'

const browserCheck = new BrowserCheck('secret-browser-check', {
  name: 'Secret browser check',
  activated: false,
  code: {
    content: 'console.info(process.env.SECRET_ENV);',
  },
})
