# checkly-cli

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/checkly-cli.svg)](https://npmjs.org/package/checkly-cli)
[![Downloads/week](https://img.shields.io/npm/dw/checkly-cli.svg)](https://npmjs.org/package/checkly-cli)
[![License](https://img.shields.io/npm/l/checkly-cli.svg)](https://github.com/ianaya89/checkly-cli/blob/master/package.json)

<!-- toc -->
* [checkly-cli](#checkly-cli)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

<!-- usage -->
```sh-session
$ npm install -g checkly-cli
$ checkly COMMAND
running command...
$ checkly (-v|--version|version)
checkly-cli/0.0.1 darwin-x64 node-v12.18.2
$ checkly --help [COMMAND]
USAGE
  $ checkly COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`checkly checks ACTION`](#checkly-checks-action)
* [`checkly conf [KEY] [VALUE]`](#checkly-conf-key-value)
* [`checkly help [COMMAND]`](#checkly-help-command)
* [`checkly init APIKEY`](#checkly-init-apikey)

## `checkly checks ACTION`

Init Checkly CLI

```
USAGE
  $ checkly checks ACTION

ARGUMENTS
  ACTION  (list|info|create|delete|update) [default: list] Specify the type of checks action to run

OPTIONS
  -o, --output=text|json  [default: json] output type
```

_See code: [src/commands/checks.js](https://github.com/checkly/checkly-cli/blob/v0.0.1/src/commands/checks.js)_

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

_See code: [conf-cli](https://github.com/natzcam/conf-cli/blob/v0.1.8/src/commands/conf.ts)_

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

## `checkly init APIKEY`

Init Checkly CLI

```
USAGE
  $ checkly init APIKEY

ARGUMENTS
  APIKEY  Checkly API Key.
          If you did not have one, create it at: https://app.checklyhq.com/account/api-keys
```

_See code: [src/commands/init.js](https://github.com/checkly/checkly-cli/blob/v0.0.1/src/commands/init.js)_
<!-- commandsstop -->
