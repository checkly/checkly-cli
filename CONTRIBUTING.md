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

To run the project locally, use:
```bash
./packages/cli/bin/dev help
```
This will use [ts-node](https://www.npmjs.com/package/ts-node) and allow you to skip compiling the TS.

To run a build with TS for type checking, run:
```bash
npm run prepare --workspace packages/cli
```

To lint the project:
```bash
npm run lint --workspace packages/cli
```

When running commands from the `packages/cli` directory, the `--workspace packages/cli` flag isn't necessary.

## Running from source in another project

You can use any branch of the code and `npm link` it so you can use the latest version in any other repo / project as if
you are using the installed NPM package

1. Go to the packages `./packages/cli` and `./packages/create-cli` directories and run `npm link`
2. Go to your other project and run `npm link @checkly/cli` and `npm link @checkly/create-cli`

Make sure you are on the same NodeJS version if you are using `nvm` or `fnm`

## Running from source in a local folder

You can use the current branch of the code against the any examples in the `/examples` directory for developing and debugging.

1. Go the `~/your_local_path` directory.
2. Run `npm create @checkly/cli -- --template boilerplate-project`
3. Just use `npx checkly` as normal.

## Releasing

To release the project to NPM:

1. Update the `version` field in [package/package.json](./package/package.json)
2. Create a new release in GitHub [here](https://github.com/checkly/checkly-cli/releases/new)

The new version will then automatically be released by the corresponding GitHub action [here](https://github.com/checkly/checkly-cli/actions/workflows/release.yml).
