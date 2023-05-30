# checkly-cli

### Dependencies

You will need to install the project's npm dependencies:

```bash
npm install --workspace packages/cli
```

```bash
npm install --workspace packages/create-cli
```

## Creating CLI project locally

To run a build with TS for type checking, run:
```bash
npm run prepare --workspace packages/create-cli
```

When running commands from the `packages/create-cli` directory, the `--workspace packages/create-cli` flag isn't necessary.

## Running locally

You can configure the stage (`production`, `staging`, `development` or `local`) using `CHECKLY_ENV` environment variable. Use `CHECKLY_ENV=local` if you want to point the API URL to your local backend `http://localhost:3000`.

Also, you can use the `watch` mode to compile during your coding. You can use the following command to start your local environment:

```bash
export CHECKLY_ACCOUNT_ID=<YOUR_LOCAL_BACKEND_ACCOUNTID>
export CHECKLY_API_KEY=<YOUR_LOCAL_BACKEND_API_KEY>
export CHECKLY_ENV=local
npm run watch --workspace packages/cli
```

### Running E2E test locally

To run the E2E tests pointing to your local backed use the `npm run test:e2e:local --workspace packages/cli`

Remember that the `--workspace packages/cli` flag isn't necessary when running commands from the `packages/cli` directory.


## Running from source in another project

You can use any branch of the code and `npm link` it so you can use the latest version in any other repo / project as if
you are using the installed NPM package

1. Go to the packages `./packages/cli` and `./packages/create-cli` directories and run `npm link`
2. Go to your other project and run `npm link checkly` and `npm link create-checkly`

Make sure you are on the same NodeJS version if you are using `nvm` or `fnm`

## Running from source in a local folder

You can use the current branch of the code against the any examples in the `/examples` directory for developing and debugging.

1. Go the `~/your_local_path` directory.
2. Run `npm create checkly -- --template boilerplate-project`
3. Just use `npx checkly` as normal.

## Prerelease experimental version

To publish a NPM package for testing purpose, you can tag the pull-request with the `build` label. A GitHub Action will be
triggered and a new experimental version can be installed by executing:

```
npm install checkly@0.0.0-pr.<PR-NUMBER>.<COMMIT_SHORT_SHA>
```

## Releasing

### Releasing `checkly` (CLI)

To release the project to NPM:

1. Update the `version` field in the [CLI package.json](./packages/cli/package.json)
2. Create a new release in GitHub [here](https://github.com/checkly/checkly-cli/releases/new)

The new version will then automatically be released by the corresponding GitHub action [here](https://github.com/checkly/checkly-cli/actions/workflows/release.yml).

### Releasing `create-checkly`
To release the [create-checkly](https://www.npmjs.com/package/create-checkly) package:

1. Update the `version` field in the [create-cli package.json](./packages/create-cli/package.json)
2. Trigger the [GitHub action](https://github.com/checkly/checkly-cli/actions/workflows/release-create-package.yml)
    * Only release from `main`

The new version will then be built and published to NPM.

## Style Guide

#### Enums vs. Union Types

In general, prefer to use Union Types rather than Enums.

Rather than:
```
enum BodyType {
  JSON = 'JSON',
  FORM = 'FORM',
  RAW = 'RAW',
}
```

use:
```
type BodyType = 'JSON' | 'FORM' | 'RAW'
```

This is especially important in public facing code (the `constructs` directory). The main goal is consistency for users. This rule is enforced by ESLint.

If an enum makes sense for a particular use case (internal code), you can explicitly disable the ESLint rule by adding:
```
// eslint-disable-next-line no-restricted-syntax
```

