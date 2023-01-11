<p align="center">
  <a href="https://checklyhq.com">
    <img height="56" src="https://www.checklyhq.com/images/footer-logo.svg"/>
    <h3 align="center">Checkly</h3>
  </a>
</p>

The Checkly CLI and Constructs in this repo together form the basic building blocks of the Checkly Monitoring-as-Code 
(MaC) workflow.

This goal of this repo and the larger MaC project is to deliver a Javascript/Typescript-native workflow for creating,
debugging, deploying and life cycling synthetic monitors (checks) at scale, from your code base.

This project is now in `alpha`:
1. Our goal is to first make a great DX / workflow for writing, debugging and deploying checks: focus on terminal, CLI and programming model.
2. Not all TS types are done yet and also UI integration is largely not there.
3. New check types, resources (like alerting channels) will follow soon.

# Getting Started

First, install the CLI.  

```bash
npm i --save-dev @checkly/cli 
```

To use TypeScript, also install `ts-node` and `typescript`:

```bash
npm i --save-dev ts-node typescript
```

Create a `checkly.config.js` (or `checkly.config.ts`) at the root of your project.

```js
const config = {
  projectName: 'My First Checkly Project',
  logicalId: 'checkly-project-1',
  checks: {
    activated: true,
    muted: false,
    runtimeId: '2022.10',
    frequency: 5,
    locations: ['us-east-1', 'eu-west-1'],
  }
}

module.exports = config;
```

Use the CLI to authenticate and pick a Checkly account. Make sure you have [signed up for a free account on checklyhq.com](https://www.checklyhq.com/).

```bash
npx checkly login
```

Now, let's create your first synthetic monitoring check, starting with a `@playwright/test` based Browser check. Create a file named `__checks__/home.spec.js`.

```js
const { expect, test } = require('@playwright/test')

test('Playwright home page', async ({ page }) => {
  const response = await page.goto('https://playwright.dev/')
  expect(response.status()).toBeLessThan(400)
  expect(page).toHaveTitle(/Playwright/)
  await page.screenshot({ path: 'homepage.jpg' })
})
```

Now run `npx checkly test` to do a dry run against the global Checkly infrastructure so we validate we didn't make any mistakes. 
This should print the message:

```
Running 1 checks in eu-central-1.

__checks__/js/home.spec.js
  ✔ home.spec.js > home.spec.js (4s)

1 passed, 1 total
```

After you have validated the check does the right thing and has no bugs, deploy the check to your account:

```bash
npx checkly deploy
```

Et voilà, you have just created a synthetic monitoring check based on Playwright from your code base! Open up [your Checkly dashboard](https://app.checklyhq.com) and you should see a your Check, ready to start monitoring
around the clock.

# Project structure

The getting started example above uses a set of defaults and conventions to get you going quickly. In more complex cases
you will want more control. The recommended way to tackle this is using a mix of **global** and **local** 
configuration.

## Global configuration

Create a `checkly.config.js` (or `checkly.config.ts`) at the root of your project.

```js
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
      testMatch: '**/*.spec.js',
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
- `cli`: Sets default values for command line flags. Setting command line flags will still override these values.
  - `runLocation`: The default run location for `checkly test`.
  - `privateRunLocation`: A [private run location](https://www.checklyhq.com/docs/private-locations/) for `checkly test`. Both `runLocation` and `privateRunLocation` can't be set at once.

## Local configuration

You can override any of the settings in the `checks` global configuration section at the individual check level.

```js
// __check__/api.check.js
const { ApiCheck } = require('@checkly/cli/constructs')

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

# Creating Checks, Alert Channels and other resources

Every resource you create using the Checkly CLI is represented by a "construct": it's a class you import from `@checkly/cli/constructs`.
A construct is the "as-code" representation of the eventual resource created / deleted / updated on the Checkly cloud once
you run `npx checkly deploy`.

Remember the following rules when creating and updating constructs:

1. Every construct needs to have a `logicalId`. This is the first argument when instantiating a class, i.e.
```js 
const check  = new ApiCheck('my-logical-id', { name: 'My API check' })
```
2. Every `logicalId` needs to be unique within the scope of a `Project`. A Project also has a `logicalId`.
3. A `logicalId` can be any string up to 255 characters in length.
4. There is no hard limit on the amount of `Project`'s you can have in your Checkly account.

Behind the scenes, we use the `logicalId` to create a graph of your resources so we now what to persist, update and remove
from our database. Changing the `logicalId` on an existing resource in your code base will tell the Checkly backend that
a resource was removed and a new resource was created.

So, I guess you know now that logical IDs are important!

## Creating an API Check

API checks are used to validate your API endpoints. Let's look at the example below as it does a couple of things:

- It defines the basic check properties like `name`, `activated` etc.
- It defines the HTTP method `GET` the `url`.
- It sets an extra header in the `headers` array.
- It defines an array of assertions to assert the HTTP response status is correct and that the JSON response body
has a property called `name` by using the [JSON path](https://jsonpath.com/) expression `*.name`
- It runs a setup script and teardown script, which are just Javascript files referenced from the same directory. 

The file hierarchy looks as follows:

```
├── __checks__
│   ├── hello-api.check.js
│   ├── setup.js
│   ├── teardown.js
```

```js
// hello-api.check.js

const { ApiCheck } = require('@checkly/cli/constructs')
const path = require('path')
const { readFileSync } = require('fs')

new ApiCheck('hello-api-1', {
  name: 'Hello API',
  activated: true,
  localSetupScript: readFileSync(path.join(__dirname, 'setup.js'), 'utf-8'),
  localTearDownScript: readFileSync(path.join(__dirname, 'teardown.js'), 'utf-8'),
  request: {
    method: 'GET',
    url: 'https://mac-demo-repo.vercel.app/api/hello',
    skipSsl: false,
    followRedirects: true,
    headers: [
      {
        key: 'X-My-Header',
        value: 'My custom header value'
      }
    ],
    assertions: [
      { source: 'STATUS_CODE', regex: '', property: '', comparison: 'EQUALS', target: '200' },
      { source: 'JSON_BODY', regex: '', property: '$.name', comparison: 'NOT_EMPTY', target: '' }
    ]
  }
})
```

The setup script just has a placeholder `console.log()` statement, but you can do a ton off stuff for authentication, overriding 
headers or other parts of the eventual HTTP request. Check our docs for examples like:

- [Fetching an OAuth2 token](https://www.checklyhq.com/docs/api-checks/setup-script-examples/#fetch-an-oauth2-access-token-using-the-client_credentials-grant)
- [Sign an AWS API request](https://www.checklyhq.com/docs/api-checks/setup-script-examples/#sign-an-aws-api-request)
- [Sign an HMAC request](https://www.checklyhq.com/docs/api-checks/setup-script-examples/#sign-an-hmac-request)
- [Create a JWT token](https://www.checklyhq.com/docs/api-checks/setup-script-examples/#create-a-jwt-token-using-the-jsonwebtoken-library)
- [Dismiss A Vercel password prompt](https://www.checklyhq.com/docs/api-checks/setup-script-examples/#dismiss-password-protection-prompt-on-vercel-deployment)

```js
// setup.js
console.log('this is a setup script')
```

Teardown script are commonly used to clean up any created test data. You can use access the previously executed HTTP request
and [for example delete some resource on your API](https://www.checklyhq.com/docs/api-checks/teardown-script-examples/#delete-created-test-data-based-on-response)

```js
// teardown.js
console.log('this is a teardown script')
```


## Creating and adding an Alert Channel

When a check fails, you want to get alerted. There are two steps to take here:

1. Create one or more alert channels. You can put them in a different file to DRY up your code, i.e. in `alert-channels.js`

```js
// alert-channels.js

const { SmsAlertChannel, EmailAlertChannel } = require('@checkly/cli/constructs')

const sendDefaults = {
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
}

const smsChannel = new SmsAlertChannel('sms-channel-1', {
  phoneNumber: '0031061234567890',
  ...sendDefaults
})

const emailChannel = new EmailAlertChannel('email-channel-1', {
  address: 'alerts@acme.com',
  ...sendDefaults
})

module.exports = {
  smsChannel,
  emailChannel
}
```

2. Now you can import these channels into one or more checks by passing the objects into the `alertChannels` array:

```js
// api.check.js

const { ApiCheck } = require('@checkly/cli/constructs')
const { smsChannel, emailChannel } = require('./alert-channels')

new ApiCheck('hello-api-1', {
  name: 'Hello API',
  alertChannels: [smsChannel, emailChannel],
  request: {
    method: 'GET',
    url: 'https://mac-demo-repo.vercel.app/api/hello',
  }
})
```

**Current limitations:**
- Not all Alert Channel types are supported yet. [Check the most current state in the codebase](https://github.com/checkly/checkly-cli/tree/main/package/src/constructs)

# Runtimes and available NPM packages

Checkly lets you use JavaScript / Typescript in your Browser checks and in the setup & teardown scripts you can 
add to your API checks. This JavaScript code executes in a runtime environment managed by Checkly. 
This environment has access to specific Node.js versions and NPM packages.

> This means not all NPM packages from NPM are available inside the context of a Check.

A runtime consists of a `runtimeId` which you can set at `Project` level or individual `Check` level.
The latest runtime is `2022.10` at the time of writing. This runtime contains among others:

- Nodejs 16.x
- `@playwright/test 1.28.0`
- `axios 0.27.2`
- `lodash 4.17.21`
- `moment 2.29.2`

...and a range of other popular NPM package to help you write and assert checks.

- [Browse the latest runtime specs](https://www.checklyhq.com/docs/runtimes/specs/)
- [Learn more about runtimes](https://www.checklyhq.com/docs/runtimes/)


# CLI

Dry run all checks in your repo:

```bash
npx checkly test
```

Dry run checks that have `product` and `api` in the file name

```bash
npx checkly test product api
```

Dry run checks while passing a specific URL and a password. These variables are available on `process.env`

```bash
npx checkly test --env "ENVIRONMENT_URL=https://preview.acme.com" --env PASSWORD=doremiabc123
```

Dry run all checks against a specific location:

```bash
npx checkly test --location eu-west-1
```

Deploy all resources to your Checkly account

```bash
npx checkly deploy
```

## Reference

### `npx checkly test`

Executes all the checks in the scope of your project on the Checkly cloud infrastructure. You can specify files to run by
appending a pattern, e.g. `npx checkly test home.spec.js api`. 

This very powerful when combined with passing environment variables using one of the flags `--env` or `--env-file` as you 
can target staging, test and preview environment with specific URLs, credentials and other common variables that differ 
between environments.

- `--env <key=value>` or `-e`: Pass environment variables to the check execution runtime. Variables passed here overwrite any existing variables stored in your Checkly account.
- `--grep <pattern>` or `-g`: Only run checks where the check name matches a regular expression.
- `--location <location>` or `-l`: Run checks against a specified location, e.g. `eu-west-1`. Defaults to `us-east-1`.
- `--private-location <private location ID>`: Run checks against the specified private location.
- `--env-file`: You can read variables from a `.env` file by passing the file path e.g. `--env-file="./.env"`

### `npx checkly deploy`

Deploys all your checks and associated resources like alert channels to your Checkly account.

- `--force` or `-f`: Skips the confirmation dialog when deploying. Handy in CI environments.

### `npx checkly login`

Logs you in to your Checkly account and clear local credentials.

### `npx checkly logout`

Logs you out of your Checkly account.

### `npx checkly whoami`

Prints the account and user you are currently logged in with.

### `npx checkly switch`

Switch witch account you are logged into based on the accounts you can access with your credentials.


# Authentication

There are different ways to authenticate when using the CLI depending on the environment where you are running the CLI from.

## Interactive

When **running the CLI interactively** from your dev environment, just use the built-in `login` command. If you have multiple
Checkly accounts, it will prompt which account you want to target

```bash
npx checkly login
```

Once authenticated, you can switch between accounts using

```bash
npx checkly switch
```

or quickly find out which account you are currently targeting with

```bash
npx checkly whoami
```

## From CI

When **running the CLI from your CI pipeline** you will need to export two variables in the shell:
- `CHECKLY_API_KEY`
- `CHECKLY_ACCOUNT_ID`

Go to your Settings page in Checkly and grab a fresh API key from [the API keys tab](https://app.checklyhq.com/settings/user/api-keys) and your
Account ID from the [Account settings tab](https://app.checklyhq.com/settings/account/general).

# Constructs API

*This will document all the properties of the various constructs based on TSDoc annotations*

## Project

## Check

### ApiCheck

### Browser Checks

Browser checks are based on [`@playwright/test`](https://playwright.dev/). You can just write `.spec.js|ts` files with test cases
and the Checkly CLI will pick them up and apply some default settings like a name, run locations and run frequency to turn 
them into synthetic monitoring checks.

However, you can override these global settings and configure individual Browser checks just like all other built-in check
types. The most important thing to is set the `code.entrypoint` property and point it to your Playwright `.spec.js|ts` file. This property supports relative and absolute paths.

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

### Freeform Checks (experimental)

## CheckGroup

## AlertChannel

# Local Development

To get started with local development check [CONTRIBUTING.MD](https://github.com/checkly/checkly-cli/blob/main/CONTRIBUTING.md)
