The Checkly CLI gives you a **JavaScript/TypeScript-native workflow** for coding, testing and deploying synthetic 
monitoring at scale, from your code base. We call this workflow **monitoring as code** (MaC).

- **Codeable, testable, reviewable monitoring constructs.** Works with your dev pipeline. From your IDE, via PR to CI.
- **Native `@playwright/test` support.** No lock-in, just write standard `*.spec.ts` files.
- **Alerting baked in.** Set alerts for Slack, SMS and many more channels.
- **Typescript-first.** Fully typed for easy refactoring and code completion.
- **Run in the cloud or on-prem.** Run on the Checkly cloud or in your network using the [Private Locations](https://www.checklyhq.com/docs/private-locations/)

# A quick example

Monitoring checks are written by instantiating constructs from the `checkly/constructs` package...

```ts
// books-api.check.ts
import { ApiCheck, AssertionBuilder } from 'checkly/constructs'

new ApiCheck('books-api-check-1', {
  name: 'Books API',
  request: {
    url: 'https://danube-web.shop/api/books',
    method: 'GET',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$[0].id').isNotNull(),
    ],
  }
})
```
For browser checks, you can just write standard `*.spec.ts` files using `@playwright/test`.

```ts
// home.spec.ts
import { test, expect } from '@playwright/test'

test('webshop homepage', async ({ page }) => {
  const response = await page.goto('https://danube-web.shop')
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveTitle(/Danube WebShop/)
  await page.screenshot({ path: 'homepage.jpg' })
})
```

Run your checks from your local machine or in CI  using `npx checkly test`

```bash
npx checkly test
Parsing your project... done

Running 2 checks in eu-west-1.

__checks__/books-api.check.ts
  ✔ Books API 1 (52ms)
__checks__/home.spec.ts  
  ✔ home.spec.ts (5s)

2 passed, 2 total
```

Now deploy your checks to the Checkly cloud so they can monitor your apps and APIs around the clock and alert you when things break.

```bash
npx checkly deploy

Parsing your project... done
Successfully deployed project "Acme webapp" to account "Acme Production".
```

# Installation

First, make sure you sign up for a [free Checkly account](https://app.checklyhq.com/signup) or signup via the terminal using
`npx checkly login`.

Then, the **easiest** way to get started is to install the CLI using the following command:

```bash
npm create checkly
```
This command will guide you through some simple steps and set up a fully working example project for you. Should take 
~1 minute.

You can also set up the CLI **from scratch** by running:

```bash
npm install --save-dev checkly
```

# Docs

Official docs are over at [checklyhq.com/docs/cli](https://checklyhq.com/docs/cli/)

## Need help? 

- Check out our [Getting Started Guide](https://checklyhq.com/docs/cli/)
- Join our [Slack Community](https://checklyhq.com/slack). The devs who built this hang out there.
- Found a bug? [File an issue on this repo](https://github.com/checkly/checkly-cli/issues/new/choose)

# Local Development

Use `CHECKLY_CLI_VERSION` environment variable to set the latest version you want to test.

To get started with local development check [CONTRIBUTING.MD](https://github.com/checkly/checkly-cli/blob/main/CONTRIBUTING.md)
