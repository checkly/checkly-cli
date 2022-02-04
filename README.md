**🚨 This project is still in very early stages and is not stable, _use at your own risk_! 🚨**

<p>
  <img height="128" src="https://www.checklyhq.com/images/footer-logo.svg" align="right" />
  <h1>checkly-cli</h1>
</p>

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@checkly/cli.svg)](https://npmjs.org/package/@checkly/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@checkly/cli.svg)](https://npmjs.org/package/@checkly/cli)

## Table of Contents

<!-- toc -->

<!-- tocstop -->

## Getting Started

This CLI enables a monitoring as code workflow where your checks live side-by-side with your code in your source control system.

To get started, install the CLI globally. You can also run it in an ad-hoc manner via `npx` every time.

1. `npm install -g @checkly/cli`

Next, `cd` to a project you'd like to monitor with Checkly.

2. `cd /opt/checkly/checklyhq.com`

You can now authenticate via the CLI and initialise the `.checkly` subdirectory.

3. `checkly login`

4. `checkly init`

The `init` command will walk you through a short wizard to get your project setup with an example check.

Now you should have a `.checkly` subdirectory in your project, which you should commit to source control, and a check yaml file like `.checkly/checks/exammple-browser.yml`.

After inspecting the check definition, making any changes, etc. you can deploy the local checks to our backend via `deploy`.

5. `checkly deploy`

Your checks are now synced and running on checkly!

Checkout [app.checklyhq.com](https://app.checklyhq.com) to see your checks in the web application.

## Usage

<!-- usage -->
```sh-session
$ npm install -g @checkly/cli
$ checkly COMMAND
running command...
$ checkly (-v|--version|version)
@checkly/cli/0.2.4 darwin-x64 node-v14.17.3
$ checkly --help [COMMAND]
USAGE
  $ checkly COMMAND
...
```
<!-- usagestop -->

## Commands

<!-- commands -->
* [`checkly accounts ACTION`](#checkly-accounts-action)
* [`checkly add RESOURCE`](#checkly-add-resource)
* [`checkly checks ACTION [ID]`](#checkly-checks-action-id)
* [`checkly deploy`](#checkly-deploy)
* [`checkly groups ACTION [ID]`](#checkly-groups-action-id)
* [`checkly help [COMMAND]`](#checkly-help-command)
* [`checkly init PROJECTNAME`](#checkly-init-projectname)
* [`checkly login`](#checkly-login)
* [`checkly logout`](#checkly-logout)
* [`checkly projects [ACTION]`](#checkly-projects-action)
* [`checkly run [CHECKPATH]`](#checkly-run-checkpath)
* [`checkly status ACTION`](#checkly-status-action)
* [`checkly switch`](#checkly-switch)
* [`checkly whoami`](#checkly-whoami)

## `checkly accounts ACTION`

Manage accounts

```
USAGE
  $ checkly accounts ACTION

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of action to run

OPTIONS
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/accounts.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/accounts.js)_

## `checkly add RESOURCE`

Add a new checkly resource

```
USAGE
  $ checkly add RESOURCE

ARGUMENTS
  RESOURCE  (check|group) [default: check] What do you want to create?
```

_See code: [src/commands/add.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/add.js)_

## `checkly checks ACTION [ID]`

Manage Checks

```
USAGE
  $ checkly checks ACTION [ID]

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of action to run
  ID      Specify the resource ID

OPTIONS
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/checks.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/checks.js)_

## `checkly deploy`

Deploy and sync your ./checkly directory

```
USAGE
  $ checkly deploy

OPTIONS
  -f, --force    force mode
  -p, --preview  Show state preview
  -x, --dryRun   Do not actually write any changes
```

_See code: [src/commands/deploy.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/deploy.js)_

## `checkly groups ACTION [ID]`

Manage Groups

```
USAGE
  $ checkly groups ACTION [ID]

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of action to run
  ID      Specify the resource ID

OPTIONS
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/groups.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/groups.js)_

## `checkly help [COMMAND]`

display help for checkly

```
USAGE
  $ checkly help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.10/src/commands/help.ts)_

## `checkly init PROJECTNAME`

Initialise a new Checkly Project

```
USAGE
  $ checkly init PROJECTNAME

ARGUMENTS
  PROJECTNAME  [default: checkly-cli] Project name

OPTIONS
  -f, --force  force mode
```

_See code: [src/commands/init.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/init.js)_

## `checkly login`

Login with a Checkly API Key

```
USAGE
  $ checkly login

OPTIONS
  -i, --account-id=account-id  Checkly account ID. (This flag is required if you are using -k (--api-key) flag

  -k, --api-key=api-key        Checkly User API Key.
                               If you did not have one, create it at: https://app.checklyhq.com/account/api-keys
```

_See code: [src/commands/login.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/login.js)_

## `checkly logout`

Logout and clear local conf

```
USAGE
  $ checkly logout

OPTIONS
  -f, --force  force mode
```

_See code: [src/commands/logout.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/logout.js)_

## `checkly projects [ACTION]`

Manage Projects

```
USAGE
  $ checkly projects [ACTION]

ARGUMENTS
  ACTION  (list|create|delete) [default: list] Project action to execute

OPTIONS
  -i, --projectId=projectId      [default: 40] project id
  -n, --name=name                project name
  -o, --output=plain|human|json  [default: human] output type
  -r, --repoUrl=repoUrl          repo url
```

_See code: [src/commands/projects.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/projects.js)_

## `checkly run [CHECKPATH]`

Run and test your checks on Checkly

```
USAGE
  $ checkly run [CHECKPATH]

ARGUMENTS
  CHECKPATH  Which check would you like to execute?

OPTIONS
  -l, --location=location        [default: eu-central-1] Where should the check run at?
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/run.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/run.js)_

## `checkly status ACTION`

Status dashboard

```
USAGE
  $ checkly status ACTION

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of action to run

OPTIONS
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/status.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/status.js)_

## `checkly switch`

Switch user account

```
USAGE
  $ checkly switch

OPTIONS
  -a, --account-id=account-id    The id of the account you want to switch.
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/switch.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/switch.js)_

## `checkly whoami`

See your logged account and user

```
USAGE
  $ checkly whoami

OPTIONS
  -o, --output=plain|human|json  [default: human] output type
```

_See code: [src/commands/whoami.js](https://github.com/checkly/checkly-cli/blob/v0.2.4/src/commands/whoami.js)_
<!-- commandsstop -->

## Troubleshooting

You can enable global debug output by setting the `DEBUG=*`.

For example:

```bash
DEBUG=* checkly init
```

## Contributing

All contributions are welcome, please stick to the `eslint` and `prettier` settings.

## License

[Apache 2.0](https://github.com/checkly/checkly-cli/blob/main/LICENSE)
