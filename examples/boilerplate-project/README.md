# Checkly Monitoring-as-code: Boilerplate Project

This example project shows how you can use the Checkly CLI in a monitoring as code (MaC) workflow. We are using the
https://checklyhq.com website as a monitoring target.

1. Write API Checks and Playwright-powered Browser Checks!
2. Test -> Deploy: now you have your app monitored around the clock. All from your code base.

```
npm create checkly@latest -- --template boilerplate-project
```

## Project Structure

This project has the basic boilerplate files needed to get you started.

```
.
├── README.md
├── __checks__
│   ├── api.check.ts
│   └── homepage.spec.ts
├── checkly.config.ts
└── package.json
```

- Running `npx checkly test` will look for `.check.ts` files and `.spec.ts` in `__checks__` directories and execute them in a dry run.

- Running `npx checkly deploy` will deploy your checks to Checkly, attach alert channels, and run them on a 10m schedule in the 
region `us-east-1` and `eu-west-1`

## CLI Commands

Run the core CLI commands with `npx checkly <command>` 

| Command              | Action                                           |
|:---------------------|:-------------------------------------------------|
| `npx checkly test`   | Dry run all the checks in your project           |
| `npx checkly deploy` | Deploy your checks to the Checkly cloud          |
| `npx checkly login`  | Log in to your Checkly account                   |
| `npx checkly --help` | Show help for each command.                      |

[Check the docs for the full CLI reference](https://www.checklyhq.com/docs/cli/command-line-reference/).

## Adding and running `@playwright/test`

You can add `@playwright/test` to this project to get full code completion and run `.spec.ts` files for local debugging.
It's best to install the Playwright npm package version that matches your [Checkly runtime](https://www.checklyhq.com/docs/cli/npm-packages/).

```bash
npm install --save-dev @playwright/test@1.38.1
```

## Questions?

Check [our CLI docs](https://www.checklyhq.com/docs/cli/), the [main Checkly docs](https://checklyhq.com/docs) or 
join our [Slack community](https://checklyhq.com/slack).
