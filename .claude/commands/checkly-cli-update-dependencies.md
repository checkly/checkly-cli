# Update Dependencies

**Input:** $ARGUMENTS

Update the monorepo's dependencies (including devDependencies) to the latest versions that remain compatible with our supported Node range. Optionally interpret `$ARGUMENTS` as a scope hint (e.g. specific package names, "dry run" to only report, or "cli only"). With no arguments, survey and update everything eligible across all workspace packages.

The guiding rule: **never raise our minimum supported Node version as a side effect of a dependency bump.** We are on the stable 8.x line; dropping Node 20 would be a breaking (v9) change, so a dependency whose newest version requires a higher Node than our floor must be held back to its latest still-compatible version.

All paths below are relative to the repo root unless noted otherwise.

## Phase 0: Determine the Node floor

- [ ] Read `engines.node` from `packages/cli/package.json` and `packages/create-cli/package.json`. They should match. The current value is `^20.19.0 || >=22.12.0`, so the **minimum supported runtime is Node 20.19.0** — this is the version every dependency must remain installable on.
- [ ] Set `FLOOR` to that minimum (e.g. `20.19.0`). Do not hardcode it from this doc — read it live, since a future major may change it.

## Phase 1: Survey what is outdated

- [ ] Run `pnpm outdated -r` to list outdated direct dependencies across all workspace packages.

## Phase 2: Choose target versions (compatibility-aware)

For each outdated package, pick the **latest version whose `engines.node` still satisfies `FLOOR`** — which may be the latest overall, or an older version if the newest major dropped support for our floor. Use this helper to compute it (requires the `semver` already installed under the CLI package):

```bash
# Prints the latest non-prerelease version of each package compatible with FLOOR.
FLOOR=20.19.0   # read this from engines.node, do not assume
SEMVER=$(ls -d node_modules/.pnpm/semver@* | head -1)
for p in "PACKAGE_NAME_1" "PACKAGE_NAME_2"; do
  enc=$(echo "$p" | sed 's#/#%2f#')
  curl -s "https://registry.npmjs.org/$enc" | \
    SEMVERDIR="$PWD/$SEMVER" PKG="$p" FLOOR="$FLOOR" node -e '
      const semver=require(process.env.SEMVERDIR+"/node_modules/semver");
      let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
        const j=JSON.parse(d), floor=process.env.FLOOR, ok=[];
        for(const [v,m] of Object.entries(j.versions)){
          if(semver.prerelease(v)) continue;
          const e=m.engines&&m.engines.node;
          if(!e || semver.satisfies(floor,e)) ok.push(v);
        }
        ok.sort(semver.rcompare);
        console.log(process.env.PKG+": latest compatible = "+(ok[0]||"NONE"));
      });'
done
```

- [ ] For every outdated package, decide its target version with the helper above. If the latest compatible version is below the latest published version, **note the gap and the reason** (newer major requires Node > our floor).

### Mandatory exclusions — do NOT update these

- [ ] **`@types/node`** — leave it untouched. We deliberately keep it *behind* latest to stay aligned with our **minimum** supported Node version. Typing against a newer Node than our floor would let code use runtime APIs that don't exist on the oldest Node we support. Pin it near our minimum Node major, not at latest.
- [ ] **`vitest`** — do not move to v4. As of this writing, vitest 4 has incompatibilities with our setup and cannot be adopted yet. Updates *within the current major* (3.x) are fine; the jump to 4.x is blocked until the incompatibilities are resolved. Re-evaluate periodically.

If `$ARGUMENTS` explicitly asks to update one of these, stop and confirm with the user, explaining the above before proceeding.

## Phase 3: Apply the updates

- [ ] Apply the chosen versions. For packages going to their latest compatible version use, e.g.:
  ```bash
  pnpm update -r --latest <pkgA> <pkgB> ...
  ```
- [ ] For packages where the latest compatible version is **not** the latest published (held-back majors), pin the explicit range instead so `--latest` doesn't overshoot:
  ```bash
  pnpm add -w -D "<pkg>@^<compatible-version>"   # -w for root devDeps; target the owning package otherwise
  ```
- [ ] Confirm the resulting `package.json` ranges and `pnpm-lock.yaml` reflect the intended versions, and that the excluded packages (`@types/node`, `vitest`) are unchanged.

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
- [ ] In the same report, call out separately what was **held back** and why (which major dropped our Node floor), and the **intentional exclusions** (`@types/node`, `vitest`).
- [ ] State the verification results plainly (build/lint/tests pass, no engine warnings).
- [ ] Do not commit or open a PR unless asked. If asked, use a `chore(deps):` conventional-commit subject and spell out the held-back/excluded packages in the body and PR description.
