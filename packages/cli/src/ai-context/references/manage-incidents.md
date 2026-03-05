# Managing Incidents

Create, update, and resolve incidents on status pages. All write commands require confirmation (see `npx checkly skills manage` for the confirmation protocol).

## List incidents

```bash
npx checkly incidents list
npx checkly incidents list --status active --output json
npx checkly incidents list --status resolved --limit 5
```

Flags:
- `--status <status>` — `active` (default), `resolved`, or `all`
- `--limit <n>` — max incidents to return
- `-o, --output <format>` — `table` (default), `json`, or `md`

## Create an incident

```bash
npx checkly incidents create \
  --status-page-id <id> \
  --title "Service degradation" \
  --severity major \
  --message "Investigating elevated error rates" \
  --services <service-id-1> --services <service-id-2>
```

Flags:
- `--status-page-id <id>` — **(required)** target status page
- `--title <text>` — **(required)** incident title
- `--severity <level>` — `minor` (default), `medium`, `major`, or `critical`
- `--message <text>` — initial update message
- `--services <id>` — affected service IDs (repeat for multiple)
- `--[no-]notify-subscribers` — notify status page subscribers (default: true)
- `--force` — skip confirmation (required for non-interactive execution after user approval)
- `--dry-run` — preview without executing

## Update an incident

```bash
npx checkly incidents update <incident-id> \
  --message "Root cause identified" \
  --status identified
```

Flags:
- `--message <text>` — **(required)** update message
- `--status <status>` — `investigating`, `identified`, `monitoring`, or `fixing`
- `--severity <level>` — update severity
- `--[no-]notify-subscribers` — notify subscribers
- `--force` — skip confirmation
- `--dry-run` — preview without executing

## Resolve an incident

```bash
npx checkly incidents resolve <incident-id> \
  --message "Issue resolved, monitoring confirms recovery"
```

Flags:
- `--message <text>` — resolution message
- `--[no-]notify-subscribers` — notify subscribers
- `--force` — skip confirmation
- `--dry-run` — preview without executing

## Status pages

Use `npx checkly status-pages list` to find status page IDs and their services. Use `--output json` to get machine-readable service IDs for incident creation.

```bash
npx checkly status-pages list
npx checkly status-pages list --output json
```
