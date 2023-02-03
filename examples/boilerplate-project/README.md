# Checkly Monitoring-as-code: Boilerplate Project

This example project shows how you can use the Checkly CLI in a Monitoring-as-Code (MaC) workflow. We are using the
https://checklyhq.com website as a monitoring target.

1. Write API Checks and Playwright-powered Browser Checks!
2. Test -> Deploy: now you have your app monitored around the clock. All from your code base.

```
npm create @checkly/cli -- --template boilerplate-project
```

## Project Structure

This project has the basic boilerplate files needed to get you started.

```
.
|-- __checks__
|   |-- api.check.ts
|   `-- homepage.spec.ts
|-- checkly.config.ts
`-- package.json
```

- Running `npx checkly test` will look for `.check.ts` files and `.spec.ts` in `__checks__` directories and execute them in a dry run.

- Running `npx check deploy` will deploy your checks to Checkly, attach alert channels, and run them on a 10m schedule in the 
region `us-east-1` and `eu-west-1`

## CLI Commands

Run the core CLI commands with `npx checkly <command>` 

| Command              | Action                                           |
|:---------------------|:-------------------------------------------------|
| `npx checkly test`   | Dry run all the checks in your project           |
| `npx checkly deploy` | Deploy your checks to the Checkly cloud          |
| `npx checkly login`  | Log in to your Checkly account                   |
| `npx checkly --help` | Show help for each command.                      |

## Questions?

Check [our CLI docs](https://github.com/checkly/checkly-cli), the [main Checkly docs](https://checklyhq.com/docs) or 
join our [Slack community](https://checklyhq.com/slack)
