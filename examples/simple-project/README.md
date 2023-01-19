# Simple Project Mac Example

This example project shows how you can use the Checkly CLI in a Monitoring-as-Code (MaC) workflow. We are using the
https://checklyhq.com website as a monitoring target.

1. Set defaults for the CLI in `checkly.config.js`
2. Set defaults for shared check configuration in a `defaults.js` file and a `alert-channels.js` file. 
3. Organize checks in `__checks__` folders at the root but also per concern, component or service, just like unit tests.
4. Triggers all the checks from GitHub Actions after a deployment is done in the `_github/workflow.yml`. If the checks pass,
deploy the checks to Checkly: now you are monitoring the webapps, sites and APIs defined in your checks around the clock.

From this example, you should be able to see how easily you can add, manage and update checks, either Playwright-based 
Browser checks or API checks using Javascript/Typescript and Git.
