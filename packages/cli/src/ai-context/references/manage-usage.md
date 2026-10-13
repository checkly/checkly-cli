# Contract usage

Read organization usage contracts, credit consumption, and projections with
`account usage`. These commands require a user or service API key with the
`usage:read` permission. Legacy account API keys are not accepted.

## Commands

Use JSON output when interpreting results or passing them to another program.

```sh
npx checkly account usage terms --output json
npx checkly account usage term <term-id> --output json
npx checkly account usage summary --usage-terms-id <term-id> --output json
npx checkly account usage series --usage-terms-id <term-id> --interval month --output json
npx checkly account usage projections <term-id> --output json
```

Read the selected term's `accounts`, `creditBudget`, `packageModel`, and
`pricingRules` before explaining its charges. Use IDs returned by `terms`.
An empty terms list is a successful result.

## Dates and selections

Summary and series accept inclusive UTC `--from` and `--to` dates in
`YYYY-MM-DD` format. Without a selection, reports can span several contracts.
The start defaults to the earliest selected usage start, or the end date.
The end defaults to today UTC. Specify dates and term IDs for a bounded report.

```sh
npx checkly account usage summary --from 2026-01-01 --to 2026-01-31 --usage-terms-id <term-id> --output json
npx checkly account usage series --from 2026-01-01 --to 2026-01-31 --account-id <account-id> --pricing-rule apiChecks --output json
```

`--usage-terms-id`, `--account-id`, and `--pricing-rule` accept repeated flags or
comma-separated values. Each list accepts at most 100 entries. Account IDs must
belong to the selected terms. Do not silently select a different account after
an authorization or selection error.

The pricing rule keys are `apiChecks`, `multistepChecks`, `browserChecks`,
`playwrightCheckSuites`, `uptimeMonitors`, `aiInvocations`, `statusPages`,
`statusPageAdditionalServices`, `statusPageAdditionalSubscribers`,
`additionalSms`, and `additionalPhoneAlerts`.

The terms list uses different date semantics. `--from` includes contracts ending
on or after that date. `--to` includes contracts starting on or before that date.
Neither bound has a default.

## Series grouping and detail

Series intervals are `total`, `day`, `week`, and `month`. The default is `day`.
Weeks start on Monday. Months follow the calendar. Boundary periods are clipped
to the requested range.

`--group-by` accepts comma-separated `account`, `usageTerm`, `pricingRule`, and
`checkType` dimensions. The CLI default is `account,checkType`. Use `none` for
an ungrouped report.

```sh
npx checkly account usage series --group-by account,usageTerm,pricingRule --include runs,calculations --output json
npx checkly account usage series --interval total --group-by none --output json
```

`--include runs` adds physical check-run counts. These counts are independent of
billed quantities, and outcome flags can overlap. `--include calculations` adds
contribution periods, pricing rules, and calculation details. Rows store grouping
values in `dimensions`. A null `checkType` means an unattributed charge.

`--check-type` filtering is unavailable in usage v2. Use `--group-by checkType`
for a breakdown or `--pricing-rule` to select charge categories. These selectors
are not equivalent to the former check-type filter.

## JSON and pagination

Terms and series expose `{ data, pagination: { nextId, length } }`. Series also
exposes `period`, `usageTermsIds`, `interval`, `groupBy`, and `coverage`.
Summary, term detail, and projections expose their resource payloads.

Both lists default to 100 entries per page and accept `--limit` from 1 to 500.
Follow `pagination.nextId` with `--cursor` while preserving the selection flags.
For series, pin `--from` and `--to` to the returned `period` when the original
request omitted them. Human output prints a complete next-page command.
Continue until `nextId` is null, including when an intermediate page is empty.
Reads are live, so measurements and prices can change between pages.

## Credit interpretation

Use the server's `creditsUsed` values. Do not recompute charges from run counts.
Credit values retain up to four decimal places. Null credits mean unavailable,
not zero. Human output uses a dash for unavailable values.

Summary reports `totals.creditsUsed`, a calculation `breakdown`, and
`coverage.gaps`. Show uncovered dates when explaining a report. A range with
coverage gaps can have null total credits even when some contributions are known.
Summary does not contain run meters or projections.

## Projections

Projections require one term ID and always cover that term's accounts and pricing
rules. They do not accept report selection filters. `--as-of` is an inclusive,
completed UTC day and defaults to yesterday UTC. Today and future dates are
rejected.

```sh
npx checkly account usage projections <term-id> --as-of 2026-01-31 --output json
```

The response includes `asOf`, current credits, remaining credits, and `sinceStart`,
`last30Days`, `last7Days`, and `last1Day` windows. Explain each forecast using its
returned period and observed days. Remaining credits can be negative.
Historical forecasts are live reads. Do not describe them as saved snapshots.

If a request fails, report its selection, permission, cursor, or storage error.
For conflicting terms, inspect contract dates and select non-overlapping IDs.
For an invalid cursor, reuse the original effective range and all filters.
