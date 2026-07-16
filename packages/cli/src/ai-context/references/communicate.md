# Customer Communications and Incident Management

Open incidents and lead customer communications via status pages.

## Confirmation Protocol

Write commands (`incidents create`, `incidents update`, `incidents resolve`, `deploy`, `destroy`, `import commit`, `import cancel`) require confirmation before executing. When the CLI detects an agent environment, it returns a JSON envelope with exit code 2 instead of executing:

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
2. **Run the `confirmCommand` verbatim, and only after the user explicitly approves.** It is normally the command you just ran, plus `--force` to skip the second prompt. Don't append `--force` to anything yourself, and don't edit the `confirmCommand` — changing its flags changes what you were authorized to do.
3. This applies to **every** write command, not just the first one. Incident updates and resolutions also require confirmation.
4. Use `--dry-run` to preview what a command will do without executing or prompting.
5. Read-only commands (`incidents list`, `status-pages list`) execute immediately without confirmation.

The `confirmCommand` omits flags left at their default, so a bare `npx checkly deploy` confirms as `checkly deploy --force` rather than echoing back every boolean the parser filled in. Treat every flag you see there as deliberate.

### Commands that pin a resolved target

A command that picks its own target before confirming writes that target back into the `confirmCommand`. `import commit` and `import cancel` do this: run without `--plan-id` they select the only candidate plan themselves, and confirm as `checkly import commit --plan-id="<resolved-id>" --force` — carrying a flag you never passed. That is deliberate: the pinned ID guarantees the approved run acts on the plan whose `changes` you showed the user, not on whatever happens to be pending by then. Run the `confirmCommand` exactly as returned; do not strip the flag or fall back to the bare command.

## Available Commands

Parse and read further reference documentation when tasked with any of the following:

<!-- REFERENCE_COMMANDS -->
