#!/usr/bin/env bash
#
# registration-inventory.sh — SPEC Rule 2 ("one test per repo") for checkly-cli.
#
# Enumerates every slot a sibling check-type construct occupies and asserts the
# new type occupies the same slots. Guards the SPEC §Phase-C anti-patterns:
#   - unregistered codegen case  -> "unsupported check type" throw at deploy
#   - construct exported but not in the CheckTypes enum / barrel
#
# Usage:
#   scripts/registration-inventory.sh <sibling> <newtype> [git-ref]
#   scripts/registration-inventory.sh --strict <sibling> <newtype> [git-ref]
#
#   <sibling>   an already-registered type token, e.g. tcp
#   <newtype>   the type to verify, e.g. grpc | ssl | traceroute
#   [git-ref]   optional branch/commit to inventory (default: working tree)
#   --strict    promote the later-phase PENDING slots to REQUIRED (the
#               end-of-Phase-3 gate form; run after 4.3 + 3.6 land)
#
# Slots (SPEC §Registration-inventory, checkly-cli list — specs/SPEC.md:601-605):
#   REQUIRED (construct registration, Phase 3):
#     src/constants.ts             CheckTypes enum entry
#     src/constructs/index.ts      barrel export
#     src/constructs/check-codegen.ts  import + describe()/gencode() switch cases
#   PENDING  (later-phase surfaces — warn-only unless --strict):
#     src/reporters/util.ts        per-checkType result-detail branch (phase 4.3)
#     src/formatters/batch-stats.ts  TIMING_TYPES set            (phase 4.3)
#     src/ai-context/context.ts    reference + example entry     (phase 3.6)
#
# Exit: 0 when every REQUIRED slot is satisfied (and, under --strict, PENDING too);
#       1 with a "<file>:<line> <SIBLING> registered but <NEWTYPE> missing" report
#       per missing slot; 2 on a usage / sibling-not-found error.
set -uo pipefail

PKG="packages/cli/src"

usage() {
  sed -n '3,33p' "$0"
  exit 2
}

STRICT=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --strict) STRICT=1 ;;
    -h|--help) usage ;;
    -*) echo "error: unknown flag '$a'" >&2; usage ;;
    *) ARGS+=("$a") ;;
  esac
done

[ "${#ARGS[@]}" -ge 2 ] || { echo "error: need <sibling> <newtype>" >&2; usage; }
SIBLING="${ARGS[0]}"
NEWTYPE="${ARGS[1]}"
REF="${ARGS[2]:-}"

# token casings: tcp -> TCP / Tcp ; grpc -> GRPC / Grpc ; traceroute -> TRACEROUTE / Traceroute
upper()  { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }
lower()  { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
pascal() { local l; l="$(lower "$1")"; printf '%s%s' "$(printf '%s' "${l:0:1}" | tr '[:lower:]' '[:upper:]')" "${l:1}"; }

S_UP="$(upper "$SIBLING")"; S_LO="$(lower "$SIBLING")"; S_PA="$(pascal "$SIBLING")"
N_UP="$(upper "$NEWTYPE")"; N_LO="$(lower "$NEWTYPE")"; N_PA="$(pascal "$NEWTYPE")"

# grep a tracked file (optionally at a ref); prints "<file>:<line>:<text>" matches.
g() { # g <pattern> <relpath>
  local pat="$1" rel="$2"
  if [ -n "$REF" ]; then
    git grep -nE -- "$pat" "$REF" -- "$PKG/$rel" 2>/dev/null | sed "s#^$REF:##"
  else
    git grep -nE -- "$pat" -- "$PKG/$rel" 2>/dev/null
  fi
}
first_loc() { head -n1 | cut -d: -f1,2; }   # <file>:<line> from a g() match

FAILS=()
WARNS=()
SIB_FOUND=0   # how many slots actually contained the sibling token (0 => bogus sibling)

# check_slot <file> <sibling-pat> <new-pat> <tier: REQUIRED|PENDING> [extra-new-pat ...]
# A slot is satisfied when the sibling pattern matches AND every new pattern matches.
check_slot() {
  local rel="$1" sib_pat="$2" tier="$4"; shift; shift; shift; shift
  local new_pats=("$@")
  local sib_hit; sib_hit="$(g "$sib_pat" "$rel")"
  if [ -z "$sib_hit" ]; then
    echo "$PKG/$rel: WARN sibling '$S_UP' not found (pattern: $sib_pat) — slot skipped" >&2
    WARNS+=("$rel:sibling-missing")
    return
  fi
  SIB_FOUND=$((SIB_FOUND+1))
  local loc; loc="$(printf '%s\n' "$sib_hit" | first_loc)"
  local missing=0 p
  for p in "${new_pats[@]}"; do
    [ -n "$(g "$p" "$rel")" ] || missing=1
  done
  if [ "$missing" -eq 0 ]; then
    printf '  ok   %-34s %s registered, %s registered\n' "$rel" "$S_UP" "$N_UP"
    return
  fi
  if [ "$tier" = "PENDING" ] && [ "$STRICT" -eq 0 ]; then
    printf '  warn %-34s %s registered, %s pending (phase 4.3/3.6)\n' "$rel" "$S_UP" "$N_UP"
    WARNS+=("$loc")
  else
    printf '  FAIL %-34s %s registered, %s MISSING\n' "$rel" "$S_UP" "$N_UP"
    FAILS+=("$loc $S_UP registered but $N_UP missing")
  fi
}

echo "registration inventory: sibling=$S_UP newtype=$N_UP ref=${REF:-<working-tree>} strict=$STRICT"
echo "REQUIRED slots (construct registration):"

# 1) CheckTypes enum entry:  TCP: 'TCP',
check_slot constants.ts \
  "^[[:space:]]*$S_UP:[[:space:]]*'$S_UP'" \
  "^[[:space:]]*$N_UP:[[:space:]]*'$N_UP'" REQUIRED \
  "^[[:space:]]*$N_UP:[[:space:]]*'$N_UP'"

# 2) barrel export:  export * from './tcp-monitor.js'
check_slot constructs/index.ts \
  "$S_LO-monitor\.js" \
  "$N_LO-monitor\.js" REQUIRED \
  "$N_LO-monitor\.js"

# 3) check-codegen.ts: import + BOTH switch cases (describe + gencode).
#    sub-slots verified independently so a half-wired codegen still FAILs:
#      import  -> <Pascal>MonitorCodegen
#      cases   -> case '<UP>'  (must appear >=2: describe() and gencode())
check_codegen() {
  local rel="constructs/check-codegen.ts" tier="REQUIRED"
  local sib_hit; sib_hit="$(g "${S_PA}MonitorCodegen" "$rel")"
  if [ -z "$sib_hit" ]; then
    echo "$PKG/$rel: WARN sibling '$S_PA' not found — slot skipped" >&2
    WARNS+=("$rel:sibling-missing"); return
  fi
  SIB_FOUND=$((SIB_FOUND+1))
  local loc; loc="$(printf '%s\n' "$sib_hit" | first_loc)"
  local import_hit case_count
  import_hit="$(g "${N_PA}MonitorCodegen" "$rel")"
  case_count="$(g "case '$N_UP'" "$rel" | wc -l | tr -d ' ')"
  if [ -n "$import_hit" ] && [ "$case_count" -ge 2 ]; then
    printf '  ok   %-34s %s wired (import + %s switch cases)\n' "$rel" "$N_UP" "$case_count"
  else
    printf '  FAIL %-34s import=%s switch-cases=%s (need import + >=2)\n' \
      "$rel" "$([ -n "$import_hit" ] && echo yes || echo no)" "$case_count"
    FAILS+=("$loc $S_PA registered but $N_PA missing (import=$([ -n "$import_hit" ] && echo yes || echo no) cases=$case_count)")
  fi
}
check_codegen

echo "PENDING slots (later-phase surfaces; $([ "$STRICT" -eq 1 ] && echo 'enforced --strict' || echo 'warn-only')):"

# 4) reporters/util.ts: per-checkType result-detail branch
check_slot reporters/util.ts \
  "checkType === '$S_UP'" \
  "checkType === '$N_UP'" PENDING \
  "checkType === '$N_UP'"

# 5) formatters/batch-stats.ts: TIMING_TYPES set membership
check_slot formatters/batch-stats.ts \
  "TIMING_TYPES.*'$S_UP'" \
  "TIMING_TYPES.*'$N_UP'" PENDING \
  "'$N_UP'"

# 6) ai-context/context.ts: reference + example entry
check_slot ai-context/context.ts \
  "${S_UP}_MONITOR" \
  "${N_UP}_MONITOR" PENDING \
  "${N_UP}_MONITOR"

echo "------------------------------------------------------------"
if [ "$SIB_FOUND" -eq 0 ]; then
  echo "error: sibling '$S_UP' not found in any slot — is it a registered type? (ref=${REF:-<working-tree>})" >&2
  exit 2
fi
if [ "${#FAILS[@]}" -gt 0 ]; then
  echo "INVENTORY FAILED — ${#FAILS[@]} slot(s) missing for $N_UP:"
  for f in "${FAILS[@]}"; do echo "  $f"; done
  exit 1
fi
echo "INVENTORY OK — $N_UP occupies every $([ "$STRICT" -eq 1 ] && echo '' || echo 'REQUIRED ')slot the $S_UP sibling does.${WARNS:+ (${#WARNS[@]} pending warning(s))}"
exit 0
