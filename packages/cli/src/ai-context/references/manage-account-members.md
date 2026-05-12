# Account Members

List active account members and pending or expired account invites.

## Usage

```bash
npx checkly account members
npx checkly account members --output json
npx checkly account members --search alice
npx checkly account members --type invite --status pending
npx checkly account members --role admin
npx checkly account members --limit 25
npx checkly account members --hide-id
```

Flags:
- `--search <term>` — match member names, member emails, and invite emails.
- `--type <type>` — `member` or `invite` (case-insensitive).
- `--role <role>` — `OWNER`, `ADMIN`, `READ_WRITE`, `READ_RUN`, or `READ_ONLY` (case-insensitive).
- `--status <status>` — `ACTIVE`, `PENDING`, or `EXPIRED` (case-insensitive).
- `-l, --limit <n>` — number of rows to return, from 1 to 100.
- `--next-id <cursor>` — cursor for the next page. Requires `--limit`.
- `-o, --output <format>` — `table` (default), `json`, or `md`.
- `--hide-id` — hide member and invite IDs in table output.

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

Member roles are `OWNER`, `ADMIN`, `READ_WRITE`, `READ_RUN`, or `READ_ONLY`. Invite roles exclude `OWNER`. Invite statuses are `PENDING` or `EXPIRED`.
