# Checkly CLI Monitoring Agent Skill

This directory contains the agent skill for creating and managing end-to-end testing, monitoring, & observability with an AI-native workflow using Checkly.

## Structure

```
skills/
└── monitoring/
    ├── README.md             # Documentation about the skill
    └── SKILL.md              # Main skill instructions
```

## What is an Agent Skill?

Agent Skills are a standardized format for giving AI agents specialized knowledge and workflows. This skill teaches agents how to:

- Create and manage API checks, Browser Checks, URL monitors, and other monitors
- Set up Playwright-based Browser and Multistep checks and Playwright Check Suites
- Configure Heartbeat Monitors for cron jobs and scheduled tasks
- Define alert channels (email, Slack, phone, webhooks, etc.)
- Build dashboards and status pages
- Follow monitoring-as-code best practices with the Checkly CLI

## Using This Skill

AI agents can load this skill to gain expertise in Checkly monitoring. The skill follows the [Agent Skills specification](https://agentskills.io) with:

- **SKILL.md**: Core instructions loaded when the skill is activated

## Progressive Disclosure

The skill is structured for efficient context usage:

1. **Metadata** (~80 tokens): Name and description in frontmatter
2. **Core Instructions** (~4.5K tokens): Main SKILL.md content with construct examples

Agents load what they need for each task.

## Learn More

- [Checkly CLI Documentation](https://www.checklyhq.com/docs/cli/overview/)
- [Checkly Constructs Reference](https://www.checklyhq.com/docs/constructs/overview/)
- [Agent Skills Specification](https://agentskills.io/specification.md)
