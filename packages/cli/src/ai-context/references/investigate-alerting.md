# Investigating Alerting Behavior

Use this read-only flow when a user asks which alert settings actually apply to
a deployed check, especially when check-local, group, global, and alert-channel
settings may interact.

Table output is insufficient for this scenario. Use JSON or raw API evidence
whenever available because human tables can omit `alertSettings`,
`useGlobalAlertSettings`, `alertChannelSubscriptions`, `groupId`, `muted`,
`activated`, `retryStrategy`, and `doubleCheck`.

Only use read-only commands. Do not deploy, update, delete, trigger checks,
start test runs, run RCA, mutate incidents, or change alert channels. When using
`checkly api`, only use `GET` requests; do not pass write methods, `-F` fields,
or request bodies.

Keep the investigation bounded. Use the commands and endpoints listed in this
reference, plus exact endpoints returned by those commands if they are needed to
follow a concrete ID. Do not guess multiple possible account/global alerting
endpoints. If a listed command or endpoint does not expose a field, report that
the field was unavailable in the inspected output instead of probing variants.

## Recommended Read-Only Command Sequence

Start by identifying one concrete check. If the user gave a name instead of an
ID, search and inspect the JSON list output before choosing:

```bash
checkly checks list --output json --limit 100
checkly checks list --output json --limit 100 --search "<check-name>"
```

Then inspect the selected check with structured output:

```bash
checkly checks get <check-id> --output json
checkly api /v1/checks/<check-id>
```

Use the CLI detail output for context only after you have captured JSON/API
evidence:

```bash
checkly checks get <check-id>
```

Inspect alert channels as structured evidence. The list helps identify channel
IDs and subscription scopes. Only call `get` for channel IDs referenced by the
selected check or matching group subscriptions, or for a user-named channel you
must verify. Do not fetch every channel when there are no relevant
subscriptions:

```bash
checkly alert-channels list --output json --limit 100
checkly alert-channels get <alert-channel-id> --output json
```

If the check has a `groupId`, fetch groups once and locate the matching group.
Use the raw API because group override fields may not have a dedicated CLI
command:

```bash
checkly api /v1/check-groups
```

If the selected check has no `groupId`, or if
`checks list --output json --limit 100` returns no checks with `groupId`, stop
group override investigation. Say that group override analysis is unavailable
from the current evidence and continue with check, global-selection, and
alert-channel evidence. Do not invent group behavior and do not keep looking for
alternative group endpoints.

This reference does not define a dedicated account/global alert-settings
endpoint. When `useGlobalAlertSettings: true` is the only account/global signal,
say that global alert settings are selected but their policy details were not
available in the inspected output. Do not probe guessed endpoints such as
account-settings, account/settings, check-alerts, or alert-notifications just to
fill that gap.

## Fields To Inspect

For the selected check, capture and explain:

- `activated` - whether the check is scheduled to run.
- `muted` - whether check-level alert notifications are suppressed.
- `groupId` - whether group settings may affect the check.
- `alertSettings` - check-local escalation policy evidence.
- `useGlobalAlertSettings` - whether the check selects account/global alert
  settings instead of a local policy.
- `alertChannelSubscriptions` - check-local or group-scoped channel bindings,
  including each subscription's `activated`, `checkId`, `groupId`, and channel
  ID.
- `retryStrategy` and `doubleCheck` - retry or double-check behavior that can
  delay or change when a failure becomes alert-worthy.

For a matching group, capture and explain:

- `activated` and `muted` - whether the group can stop runs or suppress alerts.
- `alertSettings` and `useGlobalAlertSettings` - whether the group forces a
  custom or global escalation policy for grouped checks.
- `alertChannelSubscriptions`, or alert-channel subscriptions whose `groupId`
  matches the group - which group-scoped channels are active.
- `retryStrategy` and `doubleCheck` - group-level retry behavior when present.

For alert channels, capture and explain:

- channel `id`, `type`, name/config label, and whether the channel itself is
  active if the API exposes that field.
- subscription scope: check-local (`checkId` matches the check and `groupId` is
  empty), group-scoped (`groupId` matches the check's group), or unrelated.
- subscription `activated` status. Inactive subscriptions are evidence of
  configuration, not active alert delivery.

## Effective Alerting Decision Tree

Apply this tree from confirmed evidence only:

1. Check run and notification gates:
   - If the check has `activated: false`, report that it is inactive and should
     not produce scheduled alerts unless other output proves otherwise.
   - If the check has `muted: true`, report that check-level notifications are
     suppressed.
   - If a fetched group for this check has `activated: false`, report that the
     group stops grouped checks from running when the API output confirms it.
   - If a fetched group has `muted: true`, report that group-level muting
     suppresses alerts for grouped checks.
2. Group override status:
   - If the check has no `groupId`, group overrides do not apply to this check.
   - If no grouped checks are present in the inspected list output, group
     override analysis is unavailable from current evidence.
   - If the check has a `groupId`, inspect the matching group before deciding
     effective escalation or group channel behavior.
   - If group `useGlobalAlertSettings` is `false` and group `alertSettings` is
     present, report the group escalation policy as the effective policy for
     the grouped check.
   - If group `useGlobalAlertSettings` is `true`, report that the group selects
     account/global escalation. Do not describe the global policy unless another
     output shows its values.
   - If group `useGlobalAlertSettings` is missing, `null`, or `undefined`, and
     no group `alertSettings` is present, do not claim a group escalation
     override. Continue to check-local evidence.
   - If group-scoped alert channel subscriptions are present and active, report
     them as group-scoped channels. If group channels exist but group policy
     fields are unavailable, say whether channel applicability is unavailable
     rather than assuming they apply.
3. Check-local escalation:
   - If check `useGlobalAlertSettings` is `false` and check `alertSettings` is
     present, report the check-local escalation policy as effective unless a
     confirmed group override above supersedes it.
   - If check `useGlobalAlertSettings` is `true`, report that the check selects
     account/global escalation unless a confirmed group override above supersedes
     it.
   - If check `alertSettings` and `useGlobalAlertSettings` are absent or
     contradictory, report the escalation source as unavailable instead of
     inferring defaults.
4. Account/global settings:
   - Treat account/global settings as known only when CLI or API output exposes
     their values.
   - Do not try multiple guessed account/global alerting endpoints. Use a
     documented endpoint only when this reference, CLI output, or the API
     reference gives the exact path. If that one documented request fails or does
     not include the needed fields, report the values as unavailable.
   - If output only shows `useGlobalAlertSettings: true`, say "global alert
     settings are selected, but their policy details were not available in the
     inspected CLI/API output."
5. Retry and double-check behavior:
   - If `retryStrategy` is present, explain how it affects when alerts can fire
     based on the returned fields.
   - If `doubleCheck` is present and `retryStrategy` is absent, explain the
     double-check behavior as returned.
   - If neither field is available, say retry or double-check behavior was not
     available in the inspected output.

## Response Template

Use this structure when reporting back:

```markdown
## Alerting evidence for <check-name> (<check-id>)

### Confirmed evidence
- Check state: activated=<value>, muted=<value>, groupId=<value>
- Check escalation fields: useGlobalAlertSettings=<value>, alertSettings=<summary or null>
- Retry fields: retryStrategy=<summary or unavailable>, doubleCheck=<value or unavailable>
- Sources: <commands used>

### Effective escalation policy
<State the effective escalation policy source: group custom policy, group-selected
global policy, check-local policy, check-selected global policy, or unavailable.
Quote only values visible in JSON/API output.>

### Alert channels
- Check-local channels: <active channel IDs/types/names, inactive subscriptions, or none>
- Group-scoped channels: <active channel IDs/types/names, inactive subscriptions, unavailable, or not applicable>
- Unrelated channels ignored: <short summary if useful>

### Group override status
<No groupId / no grouped checks found / matching group inspected with fields /
matching group unavailable. Explain whether group settings or channels override
or affect the check based only on confirmed fields.>

### Unavailable evidence
- Account/global alert policy details: <known values or unavailable>
- Missing fields/endpoints: <fields not present or API data not returned>

### Recommended next read-only checks
- <Only include GET/list commands that would close evidence gaps, such as
  `checkly api /v1/checks/<check-id>` or
  `checkly alert-channels get <alert-channel-id> --output json` for a channel
  ID referenced by a relevant subscription. Do not recommend guessed
  account/global alerting endpoints.>
```
