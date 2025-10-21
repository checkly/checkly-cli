# Checkly Monitoring-as-code: Advanced Project

This example project shows how you can use the Checkly CLI in a monitoring as code (MaC) workflow.

1. Write API Checks and Playwright-powered Browser Checks or fully native Playwright Check Suites.
2. Add Alert Channels, and dry-run your Checks on 20+ global locations.
3. Test -> Deploy: now you have your app monitored around the clock. All from your code base.

```
npm create checkly@latest -- --template advanced-project-js
```

## Project Structure

This project has examples of all Checkly check types and showcases some advanced features. It also adds a GitHub Actions workflow.

```
.
├── README.md
├── .github
│   └── workflow.yml
├── src
│   ├── __checks__
│   │   ├── synthetics
│   │   │   ├── 01-api.check.js
│   │   │   ├── 02-business-critical.check.js
│   │   │   ├── 03-browse-and-search.spec.js
│   │   │   ├── 04-add-to-cart.spec.js
│   │   │   ├── 05-multi-step-api.spec.js
│   │   │   └── 06-multi-step-api.check.js
│   │   ├── uptime
│   │   │   ├── heartbeat.check.js
│   │   │   ├── tcp.check.js
│   │   │   └── url.check.js
│   │   └── utils
│   │       ├── alert-channels.js
│   │       ├── auth-client.js
│   │       ├── setup.js
│   │       └── website-groups.check.js
│   └── tests
│       ├── login.setup.js
│       └── webshop-interactions.spec.js
├── checkly.config.js
├── playwright.config.js
├── package.json
└── package-lock.json
```

- Running `npx checkly pw-test` will use the `playwright.config.ts` file and run the test suite in Checkly.

- Running `npx checkly test` will look for `.check.js` files and `.spec.js` in `__checks__` directories and execute them in a dry run.

- Running `npx checkly deploy` will deploy your checks to Checkly, attach alert channels, and run them on a 10m schedule in the 
region `us-east-1` and `eu-west-1`

- An example GitHub Actions workflow is in the `.github/workflow.yml` file. It triggers all the checks in the project and deploys
them if they pass.

## CLI Commands

Run the core CLI commands with `npx checkly <command>` 

| Command              | Action                                           |
|:---------------------|:-------------------------------------------------|
| `npx checkly test`   | Dry run all the checks in your project           |
| `npx checkly pw-test`| Run playwright tests in your project             |
| `npx checkly deploy` | Deploy your checks to the Checkly cloud          |
| `npx checkly login`  | Log in to your Checkly account                   |
| `npx checkly --help` | Show help for each command.                      |

[Check the docs for the full CLI reference](https://www.checklyhq.com/docs/cli/command-line-reference/).

## Adding and running `@playwright/test`

Run `npm install` to install all required dependencies. 

 `@playwright/test` will give you full code completion and run `.spec.js` files for local debugging.

If you're using MultiStep or Browser Checks, make sure to install the Playwright npm package version that matches your [Checkly runtime](https://www.checklyhq.com/docs/cli/npm-packages/).

```bash
npm install --save-dev @playwright/test@1.54.1
```

## Questions?

Check [the Checkly CLI docs](https://www.checklyhq.com/docs/cli/), the [main Checkly docs](https://checklyhq.com/docs) or 
join our [Slack community](https://checklyhq.com/slack).
