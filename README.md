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

# Getting Started

First, install the CLI.  

```bash
npm i --save-dev @checkly/cli 
```

Then add the following section to your `package.json`

```json
{
  "checkly": {
    "projectId": "project-1",
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

The above code is "pure" Playwright code. We just need to add some options and resources to:

1. Give it a name, set a frequency how often we run it and from which regions. 
2. Add an alert channel to wake you up when the Check fails. Make sure to update your email address in the example below.

Create another file `__checks__/home.check.js`

```js
const { BrowserCheck, EmailAlertChannel } = require('@checkly/cli/constructs')

const emailChannel = new EmailAlertChannel('email-1', {
  address: 'your@email.com'
})

new BrowserCheck('browser-check-1', {
  name: 'Browser check #1',
  frequency: 10, // minutes
  regions: ['us-east-1', 'eu-west-1'],
  code: {
    entrypoint: './home.spec.js'
  }
})
```

Now run `npx checkly test` to do a dry run against the global Checkly infrastructure so we validate we didn't make any mistakes. 
This should print the message:

```
 PASS  - Browser check #1

Checks:    1 passed,  1 total
████████████████████████████████████████
```

After you have validated the check does the right thing and has no bugs, deploy the check to your account:

```bash
npx checkly deploy
```

Et voilà, you have just created a synthetic monitoring check based on Playwright from your code base! Open up [your Checkly dashboard](https://app.checklyhq.com) and you should see a your Check, ready to start monitoring
around the clock.

# Project structure

The getting started example above uses a set of defaults and conventions to get you going quickly, but the more checks you
add the less DRY your code will become. The recommended way to tackle this is using a mix of **global** and **local** 
configuration.

## Global configuration

Create a `checkly.config.js` (or `checkly.config.ts`) at the root of your project.

```js
// @ts-check

/** @type {import('@checkly/cli').ProjectConfig} */
const config = {
  projectName: 'Website Monitoring',
  logicalId: 'website-monitoring-1',
  repoUrl: 'https://github.com/acme/website',
  checks: {
    activated: true,
    muted: false,
    runtimeId: '2022.10',
    frequency: 5,
    locations: ['us-east-1', 'eu-west-1'],
    tags: ['website', 'api'],
    alertChannels: [],
    checkMatch: '**/*.check.js',
    browserChecks: {
      frequency: 10,
      checkMatch: '**/*.spec.js',
    }
  },
  cli: {
    verbose: false,
    runLocation: 'eu-west-1',
  }
}

module.exports = config;
```

- `checkMatch`: By default, Checkly looks for files matching `.*check\.(js|ts)`.

## Local configuration

You can override any of the settings in the `checks` global configuration section at the individual check level.

```js
// __check__/api.check.js

const api = new ApiCheck('hello-api', {
  name: 'Hello API',
  locations: ['ap-south-1'], // overrides the locations property
  frequency: 30, // overrides the frequency property
  request: {
    method: 'GET',
    url: 'https://api.checklyhq.com/public-stats',
    assertions: [{ source: 'STATUS_CODE', comparison: 'EQUALS', target: '200' }]
  }
})
```

# CLI

Dry run all checks in your repo:

```bash
npx checkly test
```

Dry run all checks against a specific location:

```bash
npx checkly test --run-location eu-west-1
```

Deploy all resources to your Checkly account

```bash
npx checkly deploy
```

## Reference

### `checkly test`

Executes all the checks in the scope of your project on the Checkly cloud infrastructure.

- `--run-location <location>`: Run checks against a specified location, e.g. `eu-west-1`. Defaults to `us-east-1`.

### `checkly deploy`

Deploys all your checks and associated resouces like alert channels to your Checkly account.


# API 

## ChecklyConfig

## Checks

### API Checks

### Browser Checks

Browser checks are based on [`@playwright/test`](https://playwright.dev/) 

```js
```

### Freeform Checks (experimental)

## Check Groups

## Alert Channels


# Local Development

TBD
