<p>
  <img height="128" src="https://www.checklyhq.com/images/footer-logo.svg" align="right" />
  <h1>checkly-cli</h1>
</p>

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/@checkly/cli.svg)](https://npmjs.org/package/@checkly/cli)
[![Downloads/week](https://img.shields.io/npm/dw/@checkly/cli.svg)](https://npmjs.org/package/@checkly/cli)
[![License](https://img.shields.io/npm/l/@checkly/cli.svg)](https://github.com/checkly/checkly-cli/blob/master/package.json)

## 📚 Table of Contents

<!-- toc -->

<!-- tocstop -->

## 🔧 Usage

<!-- usage -->

```sh-session
$ npm install -g @checkly/cli
$ checkly COMMAND
running command...
$ checkly (-v|--version|version)
@checkly/cli/0.0.2 darwin-x64 node-v14.17.3
$ checkly --help [COMMAND]
USAGE
  $ checkly COMMAND
...
```

<!-- usagestop -->

## 🏗️ Commands

<!-- commands -->

- [`checkly add RESOURCE`](#checkly-add-resource)
- [`checkly checks ACTION [ID]`](#checkly-checks-action-id)
- [`checkly conf [KEY] [VALUE]`](#checkly-conf-key-value)
- [`checkly deploy`](#checkly-deploy)
- [`checkly groups ACTION [ID]`](#checkly-groups-action-id)
- [`checkly help [COMMAND]`](#checkly-help-command)
- [`checkly init PROJECTNAME`](#checkly-init-projectname)
- [`checkly login`](#checkly-login)
- [`checkly logout`](#checkly-logout)
- [`checkly projects`](#checkly-projects)
- [`checkly run`](#checkly-run)
- [`checkly status ACTION`](#checkly-status-action)

## `checkly add RESOURCE`

Add a new group or check file

```
USAGE
  $ checkly add RESOURCE

ARGUMENTS
  RESOURCE  (check|group) [default: check] What do you want to create?
```

_See code: [src/commands/add.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/add.js)_

## `checkly checks ACTION [ID]`

Manage Checks

```
USAGE
  $ checkly checks ACTION [ID]

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of checks action to run
  ID      Specify the checkId

OPTIONS
  -o, --output=plain|human|json  [default: json] output type
```

_See code: [src/commands/checks.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/checks.js)_

## `checkly conf [KEY] [VALUE]`

manage configuration

```
USAGE
  $ checkly conf [KEY] [VALUE]

ARGUMENTS
  KEY    key of the config
  VALUE  value of the config

OPTIONS
  -d, --cwd=cwd          config file location
  -d, --delete           delete?
  -h, --help             show CLI help
  -k, --key=key          key of the config
  -n, --name=name        config file name
  -p, --project=project  project name
  -v, --value=value      value of the config
```

_See code: [conf-cli](https://github.com/natzcam/conf-cli/blob/v0.1.9/src/commands/conf.ts)_

## `checkly deploy`

Deploy and sync your ./checkly directory

```
USAGE
  $ checkly deploy

OPTIONS
  -o, --output=plain|human|json  [default: json] output type
  -x, --dryRun                   Do not actually write any changes
```

_See code: [src/commands/deploy.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/deploy.js)_

## `checkly groups ACTION [ID]`

Manage Groups

```
USAGE
  $ checkly groups ACTION [ID]

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of group action to run
  ID      Specify the groupId

OPTIONS
  -o, --output=plain|human|json  [default: json] output type
```

_See code: [src/commands/groups.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/groups.js)_

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

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.1/src/commands/help.ts)_

## `checkly init PROJECTNAME`

Initialise a new Checkly Project

```
USAGE
  $ checkly init PROJECTNAME

ARGUMENTS
  PROJECTNAME  [default: checkly-cli] Project name

OPTIONS
  -f, --force=force  force mode
```

_See code: [src/commands/init.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/init.js)_

## `checkly login`

Login with a Checkly API Key [WIP]

```
USAGE
  $ checkly login

OPTIONS
  --apiKey=apiKey  Checkly API Key.
                   If you did not have one, create it at: https://app.checklyhq.com/account/api-keys
```

_See code: [src/commands/login.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/login.js)_

## `checkly logout`

Logout and clear local conf

```
USAGE
  $ checkly logout
```

_See code: [src/commands/logout.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/logout.js)_

## `checkly projects`

Manage Checks

```
USAGE
  $ checkly projects

OPTIONS
  -o, --output=text|json  [default: json] output type
```

_See code: [src/commands/projects.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/projects.js)_

## `checkly run`

Run and test your checks on Checkly

```
USAGE
  $ checkly run

OPTIONS
  -c, --checkName=checkName      (required) Check upon which to execute action
  -o, --output=plain|human|json  [default: json] output type
```

_See code: [src/commands/run.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/run.js)_

## `checkly status ACTION`

Status dashboard

```
USAGE
  $ checkly status ACTION

ARGUMENTS
  ACTION  [default: info] Specify the type of checks action to run

OPTIONS
  -o, --output=plain|human|json  [default: json] output type
```

_See code: [src/commands/status.js](https://github.com/checkly/checkly-cli/blob/v0.0.2/src/commands/status.js)_

<!-- commandsstop -->

## 🚧 Troubleshooting

You can enable global debug output by setting the `DEBUG=*` or `@checkly/cli` specific debug output by setting `CONSOLA_LEVEL=4`.

For example

```bash
CONSOLA_LEVEL=4 checkly init
```

## 🙏 Contributing

All contributions are welcome, please stick to the `eslint` and `prettier` settings.

## 📖 License

[MIT](https://opensource.org/licenses/MIT)
