# Customer Communications and Incident Management

Open incidents and lead customer communications via status pages.

## Confirmation Protocol

Write commands (`incidents create`, `incidents update`, `incidents resolve`, `deploy`, `destroy`) require confirmation before executing. When the CLI detects an agent environment, it returns a JSON envelope with exit code 2 instead of executing:

```json
{
  "status": "confirmation_required",
  "command": "incidents create",
  "description": "Create incident on status page",
  "classification": { "readOnly": false, "destructive": false, "idempotent": false },
  "changes": ["Will create incident \"DB outage\" on status page \"Acme\"", "Severity: major"],
  "confirmCommand": "checkly incidents create --title=\"DB outage\" --status-page-id=\"sp-1\" --severity=\"major\" --force"
}
```

**Rules for agents:**

1. When exit code is 2 and output contains `"status": "confirmation_required"`, **always present the `changes` array to the user** and ask for confirmation.
2. **Never auto-append `--force`** — only run the `confirmCommand` after the user explicitly approves.
3. This applies to **every** write command, not just the first one. Incident updates and resolutions also require confirmation.
4. Use `--dry-run` to preview what a command will do without executing or prompting.
5. Read-only commands (`incidents list`, `status-pages list`) execute immediately without confirmation.

## Available Commands

Parse and read further reference documentation when tasked with any of the following:

<!-- REFERENCE_COMMANDS -->
