import { BrowserCheck } from 'checkly/constructs'

const browserCheck = new BrowserCheck('secret-browser-check', {
  name: 'Show SECRET_ENV value',
  activated: false,
  code: {
    content: 'console.info(process.env.SECRET_ENV);',
  },
})
