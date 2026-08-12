#!/usr/bin/env bash
# Stage the static proving assets @libid/claim loads from this origin,
# into public/. All of it is gitignored build/release output.
#
# Per platform:
#   GitHub — needs NOTHING from here. The proof comes from the
#            identity-backend; a GitHub-only deployment can skip this
#            script entirely.
#   X      — /tlsn_wasm.js /tlsn_wasm_bg.wasm /spawn.js (libid-org/notary
#            release) + /circuit/dyaka_noir_token.json (libid-circuits)
#            + /wasm/acvm_js_bg.wasm /wasm/noirc_abi_wasm_bg.wasm
#            (node_modules, via stage-noir-wasm.mjs).
#   Google — /circuits/jwt_email.json (libid-circuits) + the noir wasm
#            above + /wasm/oidc_noir_wasm.js /wasm/oidc_noir_wasm_bg.wasm
#            (built from the libid repo's rust/ tree — see below).
#
# (Yes, /circuit/ singular for X and /circuits/ plural for Google — the
# two flows grew up separately and both paths are overridable per-call in
# @libid/claim; this app keeps the defaults.)
#
# TODO: the OIDC wasm is the one asset still built from a libid checkout
# (rust/build-oidc-wasm.sh, wasm-pack 0.15.0 pinned) instead of fetched
# from a release. Point LIBID_REPO at a checkout until libid publishes it
# as a release asset, then replace that block with a fetch+sha256 like the
# circuits.
#
# Prereqs: `pnpm install` has run (noir wasm comes from node_modules);
# curl; shasum or sha256sum; for the OIDC wasm only, a libid checkout +
# wasm-pack 0.15.0.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC="$REPO_ROOT/public"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

NOTARY_RELEASE="${NOTARY_RELEASE:-v0.1.0}"
CIRCUITS_RELEASE="${CIRCUITS_RELEASE:-v0.1.0}"
# A libid checkout, for the OIDC wasm build (see the TODO above). Unset =
# skip the Google OIDC bundle with a warning.
LIBID_REPO="${LIBID_REPO:-}"

fetch() {
  # curl works anonymously — the libid-org repos are public.
  echo "==> fetch $1"
  curl -fsSL --retry 3 -o "$2" "$1"
}

sha() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

mkdir -p "$PUBLIC" "$PUBLIC/circuit" "$PUBLIC/circuits" "$PUBLIC/wasm"

# ── tlsn wasm bundle (X flow's MPC/Proxy prover) ───────────────────────────
tlsn_ver="${NOTARY_RELEASE#v}"
fetch "https://github.com/libid-org/notary/releases/download/$NOTARY_RELEASE/tlsn-wasm-$tlsn_ver.tar.gz" \
  "$WORK/tlsn-wasm.tar.gz"
mkdir -p "$WORK/tlsn"
tar -xzf "$WORK/tlsn-wasm.tar.gz" -C "$WORK/tlsn"
for f in tlsn_wasm.js tlsn_wasm_bg.wasm spawn.js; do
  src="$(find "$WORK/tlsn" -name "$f" | head -1)"
  [ -n "$src" ] || { echo "ERROR: $f missing from tlsn-wasm tarball"; exit 1; }
  cp "$src" "$PUBLIC/$f"
  echo "staged public/$f"
done

# ── circuits (verified against the release manifest) ───────────────────────
circ_ver="${CIRCUITS_RELEASE#v}"
circ_base="https://github.com/libid-org/libid-circuits/releases/download/$CIRCUITS_RELEASE"
fetch "$circ_base/manifest.json" "$WORK/manifest.json"

stage_circuit() { # tarball-suffix circuit-json dest
  local tarball="libid-circuits-$circ_ver-$1.tar.gz"
  fetch "$circ_base/$tarball" "$WORK/$tarball"
  local want have
  want=$(node -e "console.log(require('$WORK/manifest.json').tarballs['$tarball'].sha256)")
  have=$(sha "$WORK/$tarball")
  if [ "$want" != "$have" ]; then
    echo "ERROR: $tarball sha256 mismatch (manifest $want, got $have)"; exit 1
  fi
  mkdir -p "$WORK/$1"
  tar -xzf "$WORK/$tarball" -C "$WORK/$1"
  local src
  src="$(find "$WORK/$1" -name "$2" | head -1)"
  [ -n "$src" ] || { echo "ERROR: $2 missing from $tarball"; exit 1; }
  cp "$src" "$3"
  echo "staged ${3#"$PUBLIC"/} (from $tarball)"
}

stage_circuit dyaka-noir-token dyaka_noir_token.json "$PUBLIC/circuit/dyaka_noir_token.json"
stage_circuit jwt_email jwt_email.json "$PUBLIC/circuits/jwt_email.json"

# ── noir wasm (worker prover init) ─────────────────────────────────────────
node "$REPO_ROOT/scripts/stage-noir-wasm.mjs"

# ── OIDC wasm (Google flow input building) — from a libid checkout ─────────
if [ -n "$LIBID_REPO" ] && [ -x "$LIBID_REPO/rust/build-oidc-wasm.sh" ]; then
  OIDC_WASM_OUT="$PUBLIC/wasm" bash "$LIBID_REPO/rust/build-oidc-wasm.sh"
else
  echo "WARN: LIBID_REPO not set (or has no rust/build-oidc-wasm.sh) —"
  echo "      skipping the OIDC wasm. The Google flow will fail to load"
  echo "      /wasm/oidc_noir_wasm.js until it is staged. GitHub and X are"
  echo "      unaffected."
fi

echo ""
echo "Proving assets staged under public/."
