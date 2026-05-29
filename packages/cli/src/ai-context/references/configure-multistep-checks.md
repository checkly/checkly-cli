# MultiStep Checks

- Import the `MultiStepCheck` construct from `checkly/constructs`.
- Generate a separate `.spec.ts` file for the Playwright code referenced in the `MultiStepCheck` construct.
- Use the `code.entrypoint` property to specify the path to your Playwright test file.
- For env vars Checkly exposes at runtime (`CHECK_ID`, `REGION`, `RUNTIME_VERSION`, etc.), see `npx checkly skills configure environment`.

<!-- EXAMPLE: MULTISTEP_CHECK -->
