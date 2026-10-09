# Saved Views

Saved views are the tabs on the Monitors and Test sessions pages of the Checkly app. Each view stores a set of page filters and, on the Monitors page, an optional counter shown on the tab. A view is either private (only its owner sees it) or shared with everyone on the account.

## Requirements

- Saved views belong to a user, so these commands need a user API key (`npx checkly login` stores one). A service API key is rejected with "A user identity is required.", and a legacy account API key is rejected as unauthorized.
- Each member keeps at most 10 private views per page, and the account at most 10 shared views per page. Going past either limit fails with "Maximum of 10 private views reached" or "Maximum of 10 shared views reached". Making a shared view private fails with "The new owner already has the maximum of 10 private views" when its new owner is already at the limit.
- Your own private views need no permission. Seeing shared views needs `views:read`, sharing a view needs `views:share`, editing a shared view needs `views:update`, and deleting a shared view or making it private again needs `views:delete`. Without them the API answers 403 and the command prints its message.

## Usage

```bash
npx checkly ui-views list
npx checkly ui-views list --page monitors --visibility account
npx checkly ui-views list --output json
npx checkly ui-views get <id>
npx checkly ui-views get <id> --output json
npx checkly ui-views create --page monitors --name "Failing production" --filters '{"status":["failing"],"tags":["production"]}' --counter failing
npx checkly ui-views create --page test-sessions --name "Main branch" --filters '{"branches":["main"]}'
npx checkly ui-views update <id> --name "Failing in production"
npx checkly ui-views update <id> --filters '{"status":["failing","degraded"]}' --counter none
npx checkly ui-views update <id> --share
npx checkly ui-views update <id> --private
npx checkly ui-views delete <id>
```

List flags:
- `--page <page>`: `monitors` or `test-sessions` (case-insensitive; the API value `testSessions` also works).
- `--visibility <visibility>`: `private` or `account` (case-insensitive).
- `-o, --output <format>`: `table` (default), `json`, or `md`. The list is not paginated.

Create flags:
- `--page <page>` (required): `monitors` or `test-sessions`.
- `--name <name>` (required): 1 to 200 characters.
- `--filters <json>` (required): a JSON object; see "Filters" below. Use `'{}'` for a view without filters.
- `--counter <counter>`: `total`, `passing`, `degraded`, or `failing`. Monitors views only.
- New views are always private. Share one afterwards with `update <id> --share`.

Update flags (pass at least one):
- `--name <name>`: rename the view.
- `--filters <json>`: replace the view's filters with this JSON object.
- `--counter <counter>`: `total`, `passing`, `degraded`, `failing`, or `none` to remove the counter. Monitors views only.
- `--share`: share the view with everyone on the account.
- `--private`: make a shared view private again. It goes back to its creator while they are still a member, otherwise to you. Cannot be combined with `--share`.

`create`, `update`, and `delete` require confirmation. In non-interactive mode they print a `confirmation_required` preview and exit with code 2; rerun the `confirmCommand` it prints after the user approves. `--dry-run` shows the preview without changing anything. `delete` is destructive.

## Filters

The API validates filters strictly and rejects unknown keys. Every key is optional, and array filters must not repeat an item.

Monitors page (`monitors`):
- `search`: string
- `status`: string[]
- `checkType`: string[]
- `tags`: string[]
- `project`: string[] whose items are project logical IDs or `"none"`, e.g. `["none"]`
- `traces`: `active`, `none`, or `null`
- `presetWindow`: string
- `startTime`, `endTime`: string

Test sessions page (`test-sessions`):
- `statuses`: array of `FAILED`, `PASSED`, `RUNNING`
- `users`: string[]
- `branches`: string[]
- `providers`: array of `GITHUB`, `VERCEL`, `API`, `TRIGGER`, `PW_REPORTER`
- `textSearch`: string
- `presetWindow`: string
- `from`, `to`: dates

Test sessions views have no counter.

## JSON response shape

`ui-views list --output json` wraps the views in `data`. `get`, `create`, and `update` print one view:

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "page": "monitors",
  "name": "Failing production",
  "filters": { "status": ["failing"], "tags": ["production"] },
  "counter": "failing",
  "visibility": "PRIVATE",
  "createdBy": {
    "id": "22222222-2222-2222-2222-222222222222",
    "name": "Ada Admin",
    "isMember": true
  },
  "canUpdate": true,
  "canDelete": true,
  "canShare": true,
  "hidden": false,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-02T00:00:00.000Z"
}
```

- `page` is `monitors` or `testSessions`; `visibility` is `PRIVATE` or `ACCOUNT` (shared).
- `createdBy` is `null` for the views every account starts with (such as Passing, Degraded and Failing) and for views whose creator was deleted. `isMember` is `false` when the creator has left the account.
- `canUpdate`, `canDelete`, and `canShare` tell whether the caller may make those changes.
- `hidden` is `true` when the caller hid the view's tab in the app.
