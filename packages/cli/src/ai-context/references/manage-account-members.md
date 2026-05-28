# Account Members

List active account members and pending or expired account invites. Update active member roles and delete active members.

## Usage

```bash
npx checkly members
npx checkly members --output json
npx checkly members --search alice
npx checkly members --type invite --status pending
npx checkly members --role admin
npx checkly members --limit 25
npx checkly members --hide-id
npx checkly members update alice@example.com --role read_run
npx checkly members update <user-id> --role admin --id --force
npx checkly members delete alice@example.com --force
```

Flags:
- `--search <term>` — match member names, member emails, and invite emails.
- `--type <type>` — `member` or `invite` (case-insensitive).
- `--role <role>` — `owner`, `admin`, `read_write`, `read_run`, or `read_only` (case-insensitive).
- `--status <status>` — `active`, `pending`, or `expired` (case-insensitive).
- `-l, --limit <n>` — number of rows to return, from 1 to 100.
- `--next-id <cursor>` — cursor for the next page. Requires `--limit`.
- `-o, --output <format>` — `table` (default), `json`, or `md`.
- `--hide-id` — hide member and invite IDs in table output.

Role update:
- `checkly members update <member> --role <role>` updates an active account member role.
- `<member>` can be an email address or user ID. Values containing `@` are resolved as exact member emails by default; other values are treated as user IDs.
- Use `--email` or `--id` to force how `<member>` is interpreted.
- Valid update roles are `admin`, `read_write`, `read_run`, and `read_only` (case-insensitive).
- `owner` cannot be set through this command.
- This mutation requires confirmation. In non-interactive mode, rerun with `--force` after reviewing the confirmation preview.

Delete member:
- `checkly members delete <member>` removes an active account member.
- `<member>` can be an email address or user ID. Values containing `@` are resolved as exact member emails by default; other values are treated as user IDs.
- Use `--email` or `--id` to force how `<member>` is interpreted.
- This destructive mutation requires confirmation. In non-interactive mode, rerun with `--force` after reviewing the confirmation preview.
- Pending invite cancellation is not handled by this command.

## JSON response shape

```json
{
  "members": [
    {
      "type": "member",
      "accountId": "11111111-1111-1111-1111-111111111111",
      "userId": "22222222-2222-2222-2222-222222222222",
      "name": "Owner User",
      "email": "owner@example.com",
      "role": "OWNER",
      "status": "ACTIVE",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z",
      "isSupportMembership": false,
      "ssoEnabled": false,
      "mfaEnabled": true
    },
    {
      "type": "invite",
      "id": "33333333-3333-3333-3333-333333333333",
      "accountId": "11111111-1111-1111-1111-111111111111",
      "email": "pending@example.com",
      "role": "READ_ONLY",
      "status": "PENDING",
      "inviterEmail": "owner@example.com",
      "createdAt": "2026-01-03T00:00:00.000Z",
      "updatedAt": "2026-01-03T00:00:00.000Z",
      "expiresAt": "2026-02-03T00:00:00.000Z"
    }
  ],
  "length": 2,
  "nextId": null
}
```

Member roles are returned as `OWNER`, `ADMIN`, `READ_WRITE`, `READ_RUN`, or `READ_ONLY`. Invite roles exclude `OWNER`. Invite statuses are returned as `PENDING` or `EXPIRED`.
