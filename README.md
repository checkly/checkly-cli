**🚨 This project is in alpha stage right now 🚨** 

<p align="center">
  <a href="https://checklyhq.com">
    <img height="56" src="https://www.checklyhq.com/images/footer-logo.svg"/>
    <h3 align="center">Checkly</h3>
  </a>
</p>

The Checkly CLI, SDK and Constructs in this repo together form the basic building blocks of the Checkly Monitoring-as-Code 
(MaC) workflow.

This goal of this repo and the larger MaC project is to deliver a Javascript/Typescript-native workflow for creating,
debugging, deploying and life cycling synthetic monitors (checks) at scale, from your code base.

## Getting Started

First, install the CLI.  

```bash
npm i --save-dev @checkly/cli 
```

Then add the following section to your `package.json`

```json
{
  "checkly": {
    "logicalId": "project-1",
    "name": "My Checkly project",
    "repoUrl": "https://github.com/user/repo"
  }
}
```

Use the CLI to authenticate and pick a Checkly account. Make sure you have [signed up for a free account on checklyhq.com](https://www.checklyhq.com/).

```bash
checkly login
```

Now, let's create your first check, starting with a `@playwright/test` based Browser check. Create a file name `__checks__/home.spec.js`.

```js
const { expect, test } = require('@playwright/test')

test('Playwright home page', async () => {
    await page.goto('https://checklyhq.com')
    await expect(page).toHaveTitle(/Checkly/)
})
```

The above code is "pure" Playwright code. We just need to add some metadata so we can run it for you as a Check, e.g.
giving it a name, setting a frequency how often we run it and from which regions. 

Create another file `__checks__/home.check.js`

```js
const { BrowserCheck } = require('@checkly/cli/constructs')

new BrowserCheck('browser-check-1', {
  name: 'Browser check #1',
  frequency: 10, // minutes
  regions: ['us-east-1', 'eu-west-1'],
  code: {
    entrypoint: './home.spec.js'
  }
})
```

Now do a dry run against the global Checkly infrastructure so we can validate we didn't make any mistakes. 

```bash
npx checkly test
```

After you have validated the check does the right thing and has no bugs, deploy the check to your account:

```bash
npx checkly deploy
```

Et voilà, you have just created a synthetic monitoring check based on Playwright from your code base! Open up [your Checkly dashboard](https://app.checklyhq.com) and you should see a your Check, ready to start monitoring
around the clock.

## Local Development

TBD
