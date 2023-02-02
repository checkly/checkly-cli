# checkly-cli

## Running locally

To run the project locally, use:
```bash
./bin/dev help
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

## Running from source in the `/examples` folder

You can use the current branch of the code against the any examples in the `/examples` directory for developing and debugging.

1. Go the `/examples/<some-example>` directory.
2. Run `npm install`. This installs the current branch using `workspaces` magic.
3. Just use `npx checkly` as normal.

## Running from source in another project

You can use any branch of the code and `npm link` it so you can use the latest version in any other repo / project as if
you are using the installed NPM package

1. Go to the package directory and run `npm link`
2. Go to your other project and run `npm link @checkly/cli`

Make sure you are on the same NodeJS version if you are using `nvm` or `fnm`


## Releasing

To release the project to NPM:

1. Update the `version` field in [package/package.json](./package/package.json)
2. Create a new release in GitHub [here](https://github.com/checkly/checkly-cli/releases/new)

The new version will then automatically be released by the corresponding GitHub action [here](https://github.com/checkly/checkly-cli/actions/workflows/release.yml).
