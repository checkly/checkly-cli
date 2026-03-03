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
- **Option B: AI-first** — Generate the project structure and checks from scratch using this skill. Best when the user already knows what they want to monitor and prefers a tailored setup without example boilerplate.

### Option A: Scaffold with CLI

Run the following command:

```bash
npm create checkly@latest
```

The CLI will interactively handle the entire setup — project name, location, dependencies, example checks, and configuration. No further steps are needed. Setup is complete once the CLI finishes.

### Option B: AI-first

Ask the user the following questions to determine the setup:

#### Step 1: Install dependencies

1. **Install the Checkly dependency**

Check if `npx checkly --version` works. If not, run `npm install --save-dev checkly`.

2. **Do you want to use TypeScript? (recommended)**
   - If **yes** → install `ts-node`, and `typescript`:

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

   Remember the selection for later steps when creating checks.

2. **How do you want to get alerted?** (multiple selections allowed)

Run `npx checkly skills show configure alert-channels` to access up-to-date information on alert channel options and setup.

3. **Where do want to store your monitoring and construct configuration?**
   - **__checks--** - create all resources and `check.ts` files in a seperate `__checks__` directory
   - **next to the resource**: - place the `check.ts` files next to page routes, api endpoints etc.


#### Step 3 — Create the config file

Run the following command to retrieve the configure skill reference:

```bash
npx checkly skills show configure
```

Use the output to create a `checkly.config.ts` (or `checkly.config.js` if the user chose JavaScript) in the project root.

Adjust the `checkMatch` property according to previous selection.

#### Step 4: Log in to Checkly CLI

To use the Checkly CLI the user needs to be logged in. Run the following command and follow instructions:

```bash
npx checkly whoami
```

If the user is logged in, verify it it's the correct account.

#### Step 5: Test the new configuration

Run the following command to test the new setup:

```bash
npx checkly test
```
