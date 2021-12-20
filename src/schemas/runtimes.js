module.exports = {
  versions: [
    {
      name: '2021.06',
      default: false,
      description:
        'Main updates are Playwright 1.12.2, Puppeteer 10.0.0 and Node.js 14.x',
      dependencies: {
        aws4: '1.11.0',
        axios: '0.21.1',
        btoa: '1.2.1',
        chai: '4.3.4',
        'chai-string': '1.5.0',
        'crypto-js': '4.0.0',
        expect: '27.0.2',
        'form-data': '4.0.0',
        jsonwebtoken: '8.5.1',
        lodash: '4.17.21',
        mocha: '9.0.1',
        moment: '2.29.1',
        node: '14.x',
        playwright: '1.12.2',
        puppeteer: '10.0.0',
        request: '2.88.2',
        'request-promise': '4.2.2',
        uuid: '8.3.2'
      }
    },
    {
      name: '2020.01',
      default: true,
      description:
        'Main updates are Playwright 1.4.0, Puppeteer 2.0.0 and Node.js 12.x',
      dependencies: {
        aws4: '1.8.0',
        axios: '0.18.1',
        btoa: '1.2.1',
        chai: '4.2.0',
        'chai-string': '1.5.0',
        'crypto-js': '3.2.1',
        expect: '26.6.2',
        'form-data': '3.0.0',
        jsonwebtoken: '8.5.1',
        lodash: '4.17.21',
        mocha: '5.2.0',
        moment: '2.22.2',
        node: '12.x',
        playwright: '1.4.0',
        puppeteer: '2.0.0',
        request: '2.88.2',
        'request-promise': '4.2.2',
        uuid: '3.3.3'
      }
    }
  ]
}
