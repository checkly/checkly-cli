import { BrowserCheck } from 'checkly/constructs'

new BrowserCheck('check-should-have-defaults', {
  name: 'Foo',
  code: {
    content: 'console.log()',
  },
})

new BrowserCheck('check-should-not-have-defaults', {
  name: 'Foo',
  code: {
    content: 'console.log()',
  },
  tags: ['not default tags'],
  playwrightConfig: {
    use: {
      baseURL: 'https://example.org/self',
    },
  },
})
