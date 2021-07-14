<p>
  <img height="128" src="https://www.checklyhq.com/images/footer-logo.svg" align="right" />
  <h1>checkly-cli</h1>
</p>

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/checkly-cli.svg)](https://npmjs.org/package/checkly-cli)
[![Downloads/week](https://img.shields.io/npm/dw/checkly-cli.svg)](https://npmjs.org/package/checkly-cli)
[![License](https://img.shields.io/npm/l/checkly-cli.svg)](https://github.com/ianaya89/checkly-cli/blob/master/package.json)

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
@checkly/cli/0.0.1 linux-x64 node-v14.17.1
$ checkly --help [COMMAND]
USAGE
  $ checkly COMMAND
...
```

<!-- usagestop -->

## 🏗️ Commands

<!-- commands -->

- [`checkly checks ACTION [ID]`](#checkly-checks-action-id)
- [`checkly conf [KEY] [VALUE]`](#checkly-conf-key-value)
- [`checkly help [COMMAND]`](#checkly-help-command)
- [`checkly init PROJECTNAME`](#checkly-init-projectname)
- [`checkly login APIKEY`](#checkly-login-apikey)

## `checkly checks ACTION [ID]`

Retrieve and handle checks

```
USAGE
  $ checkly checks ACTION [ID]

ARGUMENTS
  ACTION  (list|info) [default: list] Specify the type of checks action to run
  ID      Specify the check di

OPTIONS
  -o, --output=text|json  [default: text] output type
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

_See code: [conf-cli](https://github.com/natzcam/conf-cli/blob/v0.1.9/src/commands/conf.ts)_

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

Init a new Checkly project

```
USAGE
  $ checkly init PROJECTNAME

ARGUMENTS
  PROJECTNAME  Project name
```

_See code: [src/commands/init.js](https://github.com/checkly/checkly-cli/blob/v0.0.1/src/commands/init.js)_

## `checkly login APIKEY`

Login with a Checkly API Key

```
USAGE
  $ checkly login APIKEY

ARGUMENTS
  APIKEY  Checkly API Key.
          If you did not have one, create it at: https://app.checklyhq.com/account/api-keys
```

_See code: [src/commands/login.js](https://github.com/checkly/checkly-cli/blob/v0.0.1/src/commands/login.js)_

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
