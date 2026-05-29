# Check Groups

- Import the `CheckGroupV2` construct from `checkly/constructs`.
- Check Groups are used to group checks together for easier management and organization.
- Checks are added to Check Groups by referencing the group in the `group` property of a check.
- **Alert channels on a group require `alertEscalationPolicy`.** If you set custom `alertChannels` on a `CheckGroupV2` without also setting `alertEscalationPolicy`, the group's channels are ignored and each check uses its own alert settings. Use `alertEscalationPolicy: 'global'` to apply the account-wide policy, or build a custom policy with `AlertEscalationBuilder` from `checkly/constructs`.

<!-- EXAMPLE: CHECK_GROUP -->
