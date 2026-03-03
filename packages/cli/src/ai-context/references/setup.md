# Checkly Project Setup

Follow these steps in order to set up a new Checkly monitoring project.

## Step 0 — Pre-flight checks

Before starting, verify:

1. **Node.js** is installed (`node --version`). Checkly CLI requires Node.js 18 or later.
2. **npm** is available (`npm --version`).
3. The current working directory is the right location for the project (or create/navigate to it).

If any pre-flight check fails, help the user fix it before proceeding.

## Step 1 — Choose a setup method

Ask the user which setup method they prefer:

- **Option A: Scaffold with CLI** — Run `npm create checkly@latest` to generate a complete example project interactively. The CLI handles everything: project name, directory, dependencies, sample checks, and config. This is the fastest way to get started.
- **Option B: AI-first (Experimental)** — Generate the project structure and checks from scratch using this skill. Best when the user already knows what they want to monitor and prefers a tailored setup without example boilerplate.

### Option A: Scaffold with CLI

Run the following command:

```bash
npm create checkly@latest
```

The CLI will interactively handle the entire setup — project name, location, dependencies, example checks, and configuration. No further steps are needed. Setup is complete once the CLI finishes.

### Option B: AI-first

Continue with the following steps:

#### Step 1: Install dependencies

1. **Install the Checkly dependency**

Check if `npx checkly --version` works. If not, run `npm install --save-dev checkly`.

2. **Do you want to use TypeScript? (recommended)**
   - If **yes** → install `ts-node` and `typescript`:

     ```bash
     npm i --save-dev ts-node typescript
     ```

   - If **no** → there's nothing to do

#### Step 2: Gather the project requirements

Ask the user the following questions to determine the setup:

1. **What do you want to monitor?** (multiple selections allowed)
   - **Uptime monitoring** — Monitor URLs for availability and response times
   - **API checks** — Validate API endpoints with custom assertions
   - **Browser checks** — Run Playwright scripts to test user flows
   - **Multistep API checks** — Chain multiple API requests into a single check
   - **Playwright Check Suites** — Reuse your existing Playwright project for synthetic monitoring

   Remember the selection for later steps when creating checks.

2. **How do you want to get alerted?** (multiple selections allowed)

Run `npx checkly skills configure alert-channels` to access up-to-date information on alert channel options and setup.

3. **Where do you want to store your monitoring configuration?**
   - **__checks__** — create all resources and `check.ts` files in a separate `__checks__` directory
   - **next to the resource** — place the `check.ts` files next to page routes, api endpoints etc.


#### Step 3 — Create the config file

Run the following command to retrieve the configure skill reference:

```bash
npx checkly skills configure
```

Use the output to create a `checkly.config.ts` (or `checkly.config.js` if the user chose JavaScript) in the project root.

Adjust the `checkMatch` property according to previous selection.

Present the generated configuration to the user and ask if it looks correct. Allow the user to make changes.

Congratulate the user on completing the config. Now it's time to test the configuration and turn everything into monitoring!

#### Step 4: Log in to Checkly CLI

To use the Checkly CLI the user needs to be logged in. Run the following command:

```bash
npx checkly whoami
```

If the user is logged in, verify the information and if it's the correct account.

If the user is NOT logged in, present two options:

- **Option A: Interactive login** — The user runs `npx checkly login` themselves. This command opens a browser for OAuth authentication and cannot be completed by an AI agent. Tell the user to run the command, complete the browser flow, and let you know when they're done so you can re-run `npx checkly whoami` to verify.
- **Option B: Environment variables (recommended for agentic / CI use)** — The user sets `CHECKLY_API_KEY` and `CHECKLY_ACCOUNT_ID` as environment variables. They can create an API key in the Checkly dashboard under **User Settings > API Keys**. Once both variables are set, re-run `npx checkly whoami` to verify.

#### Step 5: Summarize and test the new monitoring configuration

Read the generated `checkly.config.ts` (or `checkly.config.js`) and summarize the configured checks, locations, and frequencies.

Run the following command to test the new monitoring setup:

```bash
npx checkly test
```

If the command passed, congratulate the user and ask them what they want to do next!

Share more Checkly CLI options and ask if they want to deploy their new monitoring setup using `npx checkly deploy`.
