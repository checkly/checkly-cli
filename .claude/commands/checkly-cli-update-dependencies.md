# Update Dependencies

**Input:** $ARGUMENTS

Update the monorepo's dependencies (including devDependencies) to the latest versions that remain compatible with our supported Node range. Optionally interpret `$ARGUMENTS` as a scope hint (e.g. specific package names, "dry run" to only report, or "cli only"). With no arguments, survey and update everything eligible across all workspace packages.

Two guiding rules:

1. **Never raise our minimum supported Node version as a side effect of a dependency bump.** We are on the stable 8.x line; dropping Node 20 would be a breaking (v9) change, so a dependency whose newest version requires a higher Node than our floor must be held back to its latest still-compatible version.
2. **Respect the release-age embargo.** `pnpm-workspace.yaml` sets `minimumReleaseAge` (currently `2880` minutes = 2 days): pnpm refuses to install any version published within that window (a supply-chain safeguard). So the effective target for every package is the latest version that is **both** floor-compatible **and** older than the embargo. A version that is newer but still inside the embargo is not "held back" permanently — it is simply not eligible yet; note it and re-evaluate on the next run.

Because of rule 2, the npm registry's `latest` tag (and any tool that reads it directly, including the helper below and raw `pnpm outdated`) can **over-report** — it will name versions the embargo blocks. The authoritative target is whatever `pnpm update` actually resolves, since pnpm enforces the embargo. Never bypass it (e.g. with an explicit `pnpm add pkg@<too-new>` or the `minimumReleaseAgeExclude` setting) to force a version pnpm refused.

All paths below are relative to the repo root unless noted otherwise.

## Phase 0: Determine the constraints (Node floor + release-age embargo)

- [ ] Read `engines.node` from `packages/cli/package.json` and `packages/create-cli/package.json`. They should match. The current value is `^20.19.0 || >=22.12.0`, so the **minimum supported runtime is Node 20.19.0** — this is the version every dependency must remain installable on.
- [ ] Set `FLOOR` to that minimum (e.g. `20.19.0`). Do not hardcode it from this doc — read it live, since a future major may change it.
- [ ] Read `minimumReleaseAge` from `pnpm-workspace.yaml` and set `EMBARGO_MIN` to it (e.g. `2880`). Do not hardcode it from this doc — read it live. Any version published more recently than `EMBARGO_MIN` minutes ago is not installable yet.

## Phase 1: Survey what is outdated

- [ ] Run `pnpm install` first. `pnpm outdated` compares the **installed** tree against the registry, so without `node_modules` it reports every package as `missing (wanted …)` and the survey is worthless — it lists every direct dependency, including ones already up to date, rather than only what is actually outdated. A fresh git worktree never has `node_modules` (gitignored artifacts are not shared between worktrees), so this step is essential there; elsewhere it is idempotent and safe to repeat.
- [ ] Run `pnpm outdated -r` to list outdated direct dependencies across all workspace packages. If the `Current` column reads `missing` for everything, the install above did not happen — stop and install before going further.

## Phase 2: Choose target versions (compatibility- and embargo-aware)

For each outdated package, pick the **latest version that both satisfies `FLOOR` and clears the release-age embargo**. That may be the registry's latest overall, or something older — because the newest major dropped support for our floor, or because the newest release is still inside the embargo window. Use this helper to compute it (requires the `semver` already installed under the CLI package):

```bash
# Prints the latest non-prerelease version of each package that is BOTH
# floor-compatible AND older than the release-age embargo.
FLOOR=20.19.0      # read from engines.node, do not assume
EMBARGO_MIN=2880   # read minimumReleaseAge from pnpm-workspace.yaml, do not assume
SEMVER=$(ls -d node_modules/.pnpm/semver@* | head -1)
for p in "PACKAGE_NAME_1" "PACKAGE_NAME_2"; do
  enc=$(echo "$p" | sed 's#/#%2f#')
  curl -s "https://registry.npmjs.org/$enc" | \
    SEMVERDIR="$PWD/$SEMVER" PKG="$p" FLOOR="$FLOOR" EMBARGO_MIN="$EMBARGO_MIN" node -e '
      const semver=require(process.env.SEMVERDIR+"/node_modules/semver");
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const j=JSON.parse(d), floor=process.env.FLOOR;
        const cutoff=Date.now()-Number(process.env.EMBARGO_MIN)*60000, ok=[];
        for(const [v,m] of Object.entries(j.versions)){
          if(semver.prerelease(v)) continue;
          const e=m.engines&&m.engines.node;
          if(e && !semver.satisfies(floor,e)) continue;   // fails the Node floor
          const t=j.time&&j.time[v];
          if(t && Date.parse(t)>cutoff) continue;          // still inside the embargo
          ok.push(v);
        }
        ok.sort(semver.rcompare);
        console.log(process.env.PKG+": latest installable = "+(ok[0]||"NONE"));
      });'
done
```

- [ ] For every outdated package, decide its target version with the helper above. If the target is below the latest published version, **note the gap and which constraint caused it**: newer major requires Node > our floor (held back), or newest release is still inside the embargo (not eligible yet — re-evaluate next run).
- [ ] The helper is a cross-check, not the source of truth. `pnpm update` (Phase 3) enforces both constraints itself, so its resolved versions are authoritative; if they disagree with the helper, trust pnpm and investigate the discrepancy rather than forcing the helper's answer.

### Mandatory exclusions — do NOT update these

- [ ] **`@types/node`** — leave it untouched. We deliberately keep it *behind* latest to stay aligned with our **minimum** supported Node version. Typing against a newer Node than our floor would let code use runtime APIs that don't exist on the oldest Node we support. Pin it near our minimum Node major, not at latest.
- [ ] **`vitest`** — do not move to v4. As of this writing, vitest 4 has incompatibilities with our setup and cannot be adopted yet. Updates *within the current major* (3.x) are fine; the jump to 4.x is blocked until the incompatibilities are resolved. Re-evaluate periodically.

If `$ARGUMENTS` explicitly asks to update one of these, stop and confirm with the user, explaining the above before proceeding.

## Phase 3: Apply the updates

- [ ] Apply the chosen versions. For packages going to their latest compatible version use, e.g.:
  ```bash
  pnpm update -r --latest <pkgA> <pkgB> ...
  ```
  `--latest` will not overshoot into an embargoed version: pnpm enforces `minimumReleaseAge`, so it resolves each named package to the newest version that is both floor-compatible and past the embargo. If it appears to skip a version you expected, that version is almost certainly still inside the embargo — confirm the publish date rather than forcing it.
- [ ] For packages where the latest compatible version is **not** the latest published because the newest major raises our Node floor (held-back majors), pin the explicit range instead so `--latest` doesn't overshoot:
  ```bash
  pnpm add -w -D "<pkg>@^<compatible-version>"   # -w for root devDeps; target the owning package otherwise
  ```
- [ ] `pnpm update --latest` also refreshes unrelated in-range transitive dependencies, which bloats the diff. For a minimal, reviewable change, once the `package.json` ranges are correct, restore the committed lockfile and let a plain install rewrite only what the new ranges require:
  ```bash
  git checkout HEAD -- pnpm-lock.yaml && pnpm install
  ```
- [ ] Confirm the resulting `package.json` ranges and `pnpm-lock.yaml` reflect the intended versions; that the excluded packages (`@types/node`, `vitest`) are unchanged; that no embargoed version leaked into the lockfile; and that `pnpm install --frozen-lockfile` reports the lockfile is up to date.

## Phase 4: Verify

Run the full local pipeline and confirm each step is green before reporting success:

- [ ] **Build both packages:** `pnpm --filter checkly run prepare:dist` and `pnpm --filter create-checkly run prepare`
- [ ] **Lint:** `pnpm lint`
- [ ] **Commitlint smoke test** (it has a Node floor of its own — proves the held-back versions still work):
  `echo "feat: x" | pnpm exec commitlint` (accepts) and `echo "nope" | pnpm exec commitlint` (rejects)
- [ ] **Unit tests:** `pnpm --filter checkly test` and `pnpm --filter create-checkly exec vitest --run`
- [ ] **Re-confirm the Node floor:** for every changed package, read `engines.node` from its installed copy under `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/package.json` and verify it satisfies `FLOOR`. There should be no `engines` warnings during install.

## Phase 5: Report

- [ ] Summarize in a table with these columns: **Package**, **Type** (`dependency` or `devDependency` — list whichever it is in the manifest), **Owning package** (`checkly`, `create-checkly`, or root), **From → To**, and **Notes**.
- [ ] In the same report, call out separately: what was **held back** and why (which major dropped our Node floor); what was **not eligible this week** because its newest release is still inside the release-age embargo (name the version and re-evaluate next run); and the **intentional exclusions** (`@types/node`, `vitest`).
- [ ] State the verification results plainly (build/lint/tests pass, no engine warnings).
- [ ] Do not commit or open a PR unless asked. If asked, use a `chore(deps):` conventional-commit subject and spell out the held-back/excluded packages in the body and PR description. The PR title should include the current date (e.g. `chore(deps): weekly CLI dependency update (2026-06-15)`).
