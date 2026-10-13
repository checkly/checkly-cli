# Usage v2 migration

The CLI's `account usage` commands now use usage v2 reporting endpoints.
The command names `terms`, `summary`, and `series` remain available. V2 changes
their response models and adds `term` and `projections` commands.

## Command changes

| Command | Behavior |
| --- | --- |
| `account usage terms` | A paginated list of contracts. The default output is a table. |
| `account usage term <id>` | One contract's dates, budget, accounts, package model, and pricing rules. |
| `account usage summary` | Credit totals, pricing calculation breakdowns, and coverage gaps across selected contracts. |
| `account usage series` | Periodic credits with composable grouping and optional physical run counts or calculations. |
| `account usage projections <id>` | Forecasts for one contract through a completed UTC day. |

Summary no longer includes the v1 check-run or AI meter model and embedded
projections. Physical run counts are available through series `--include runs`.
Projections have their own term-scoped command.

## Selection and date changes

Summary and series accept `--usage-terms-id`, `--account-id`, and `--pricing-rule`.
These flags accept repeated or comma-separated values, with at most 100 entries
per list.

Unfiltered reports can span multiple contracts. `--to` defaults to today UTC.
`--from` defaults to the earliest selected usage start, or the end date. Both
dates are inclusive. This replaces v1's selection of one contract by end date.
Explicit dates and term IDs keep a report bounded.

Terms listing `--from` and `--to` filter contracts that overlap the supplied
range. Neither bound defaults to today. The list returns all reachable contracts
through cursor pagination, rather than one contract for the supplied end date.

Series keeps the CLI defaults of `--interval day` and
`--group-by account,checkType`. Grouping now accepts combinations of `account`,
`usageTerm`, `pricingRule`, and `checkType`, or `none` for no dimensions.
`--include` accepts `runs`, `calculations`, or both.

The former `--check-type` filter fails with migration guidance. A pricing rule
filter selects charge categories and does not reproduce every check-type filter.
Grouping by `checkType` provides a breakdown without filtering consumption.

Projections default to yesterday UTC. `--as-of` accepts only completed UTC dates.
Today and future dates are rejected. Projections cover the complete selected
contract and do not accept account or pricing rule filters.

## JSON changes

Terms and series preserve the CLI list envelope:

```json
{
	"data": [],
	"pagination": {
		"nextId": null,
		"length": 0
	}
}
```

Series also includes `period`, `usageTermsIds`, `interval`, `groupBy`, and
`coverage` beside that envelope. Term detail, summary, and projections expose
their resource payloads.

| Former field | V2 field or command |
| --- | --- |
| Summary `usageTermsId` | Summary `usageTermsIds` |
| Summary `totals.credits.used` | Summary `totals.creditsUsed` |
| Summary `totals.meters` | Summary `breakdown`, or series `runs` with `--include runs` |
| Summary `projections` | `account usage projections <id>` |
| Series `period.interval` and `period.groupBy` | Top-level `interval` and `groupBy` |
| Series row `accountId` and `checkType` | Row `dimensions.accountId` and `dimensions.checkType` |
| Series row `credits.used` | Row `creditsUsed` |
| Series `warnings` | `coverage.gaps` for uncovered dates |

Cursor paging uses `pagination.nextId`. Series continuation commands preserve
the effective returned dates and all selection flags. A cursor is bound to its
query. Measurements and prices remain live between pages.

## Credit and permission changes

The CLI displays server-calculated credits with up to four decimal places.
Null credits remain null in JSON and appear as a dash in human output.
Null does not mean zero. Coverage gaps stay visible, including in empty reports.
Remaining projection credits can be negative.

Run counters describe physical runs, independently of billed quantities.
Outcome flags can overlap. Organization-level charges can have no account
attribution, and a null check type appears as `Unattributed`.

Usage reporting requires a user or service API key with `usage:read` permission.
Permission errors name that requirement. Legacy account API keys remain
unsupported.

The CLI requires all five v2 reporting endpoints before release. It does not
fall back to v1 if a v2 endpoint is unavailable.
