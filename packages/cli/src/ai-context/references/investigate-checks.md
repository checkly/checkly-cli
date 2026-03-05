# Inspecting Checks

List and inspect deployed checks in your Checkly account.

## List checks

```bash
npx checkly checks list
npx checkly checks list --tag production --type PLAYWRIGHT
npx checkly checks list --search "Homepage" --output json
```

Flags:
- `--tag <tag>` — filter by tag
- `--type <type>` — filter by check type (`API`, `BROWSER`, `PLAYWRIGHT`, `MULTI_STEP`)
- `--search <name>` — filter by name
- `-o, --output <format>` — `table` (default), `json`, or `md`

## Get check details

```bash
npx checkly checks get <check-id>
npx checkly checks get <check-id> --output json
```

Shows check configuration, recent results, and error groups.

### View a specific check result

```bash
npx checkly checks get <check-id> --result <result-id>
```

### View an error group

```bash
npx checkly checks get <check-id> --error-group <error-group-id>
```

## Trigger checks

```bash
npx checkly trigger --tags production
npx checkly trigger --tags critical,api
```

Triggers existing deployed checks by tag. Useful for on-demand verification.
