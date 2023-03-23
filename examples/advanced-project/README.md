# Checkly Monitoring-as-code: Advanced Project

This example project shows how you can use the Checkly CLI in a monitoring as code (MaC) workflow. We are using the
https://checklyhq.com website as a monitoring target.

1. Write API Checks and Playwright-powered Browser Checks.
2. Add Alert Channels, and dry-run your Checks on 20+ global locations.
3. Test -> Deploy: now you have your app monitored around the clock. All from your code base.

```
npm create @checkly/cli -- --template advanced-project
```

## Project Structure

This project mimics a typical app where you organize code with top-level defaults and per page, service or component checks.

```
.
|-- .github
|   `-- workflow.yml
|-- checkly.config.ts
|-- package.json
`-- src
    |-- __checks__
    |   |-- 404.spec.ts
    |   |-- api.check.ts
    |   |-- home.check.ts 
    |   |-- homepage.spec.ts     
    |   `-- website.check-group.ts
    |-- alert-channels.ts
    |-- defaults.ts
    `-- services
        |-- api
        |   `-- __checks__        
        |       `-- api.check.ts
        `-- docs
            `-- __checks__
                `-- docs-search.spec.ts

```

- Running `npx checkly test` will look for `.check.ts` files and `.spec.ts` in `__checks__` directories and execute them in a dry run.

- Running `npx check deploy` will deploy your checks to Checkly, attach alert channels, and run them on a 10m schedule in the 
region `us-east-1` and `eu-west-1`

- An example GitHub Actions workflow is in the `.github/workflow.yml` file. It triggers all the checks in the project and deploys
them if they pass.

## CLI Commands

Run the core CLI commands with `npx checkly <command>` 

| Command              | Action                                           |
|:---------------------|:-------------------------------------------------|
| `npx checkly test`   | Dry run all the checks in your project           |
| `npx checkly deploy` | Deploy your checks to the Checkly cloud          |
| `npx checkly login`  | Log in to your Checkly account                   |
| `npx checkly --help` | Show help for each command.                      |

[Check the docs for the full CLI reference](https://www.checklyhq.com/docs/cli/command-line-reference/)

## Questions?

Check [our CLI docs](https://github.com/checkly/checkly-cli), the [main Checkly docs](https://checklyhq.com/docs) or 
join our [Slack community](https://checklyhq.com/slack)
