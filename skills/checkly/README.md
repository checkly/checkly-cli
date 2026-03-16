# Checkly CLI Agent Skill

This directory contains the agent skill for setting up, creating, and managing end-to-end testing, monitoring, & observability with an AI-native workflow using Checkly.

## Structure

```
skills/
└── checkly/
    ├── README.md   # Documentation about the skill
    └── SKILL.md    # Main skill instructions
```

## Why are there no `references`?

The Checkly CLI provides a `npx checkly skills` command which gives your agent all the tools to request the right information at the right time.

## What is an Agent Skill?

Agent Skills are a standardized format for giving AI agents specialized knowledge and workflows. This skill teaches agents how to:

- Create and manage API checks, Browser Checks, URL monitors, and other monitors
- Set up Playwright-based Browser and Multistep checks and Playwright Check Suites
- Configure Heartbeat Monitors for cron jobs and scheduled tasks
- Define alert channels (email, Slack, phone, webhooks, etc.)
- Build dashboards and status pages
- Follow monitoring-as-code best practices with the Checkly CLI

## Installing This Skill

Run `npx checkly skills install` to install the skill into your project. The command supports Claude Code, Cursor, Codex and more out of the box, or you can specify a custom path.

## Using This Skill

AI agents can load this skill to gain expertise in Checkly monitoring. The skill follows the [Agent Skills specification](https://agentskills.io) with:

- **SKILL.md**: Core instructions loaded when the skill is activated. It references the `npx checkly skills` command for detailed construct documentation and examples.

## Learn More

- [Checkly CLI Documentation](https://www.checklyhq.com/docs/cli/overview/)
- [Checkly Constructs Reference](https://www.checklyhq.com/docs/constructs/overview/)
- [Agent Skills Specification](https://agentskills.io/specification.md)
