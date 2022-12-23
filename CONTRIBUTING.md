# checkly-cli

## Running locally

To run the project locally, use:
```
./bin/dev help
```
This will use [ts-node](https://www.npmjs.com/package/ts-node) and allow you to skip compiling the TS.

To run a build with TS for type checking, run:
```
npm run prepare --workspace package
```

To lint the project:
```
npm run lint --workspace package
```

When running commands from the `package` directory, the `--workspace package` flag isn't necessary.

## Releasing

To release the project to NPM, create a new release in GitHub [here](https://github.com/checkly/checkly-cli/releases/new).

This new tag will then automatically be released by the corresponding GitHub action [here](https://github.com/checkly/checkly-cli/actions/workflows/release.yml).