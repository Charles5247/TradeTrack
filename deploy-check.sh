#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-check.sh
# ─────────────────────────────────────────────────────────────────────────────
# Pre-deployment sanity gate for TradeTrack. Run this before deploying to
# Vercel (or any other host) to catch environment, type, and build issues
# early.
#
# Usage:
#   ./deploy-check.sh          # full check: env + typecheck + lint + build
#   ./deploy-check.sh --skip-build   # skip the (slow) production build step
#
# Exits non-zero on the first failing step.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SKIP_BUILD=false
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

step() {
  echo ""
  echo "───────────────────────────────────────────────────────────────────"
  echo "▶ $1"
  echo "───────────────────────────────────────────────────────────────────"
}

fail() {
  echo ""
  echo "❌ Deploy check FAILED at step: $1"
  exit 1
}

step "1/4  Verifying environment variables"
npx tsx scripts/verify-env.ts || fail "environment verification"

step "2/4  Type-checking (tsc --noEmit)"
npx tsc --noEmit || fail "TypeScript type-check"

step "3/4  Linting"
npm run lint || fail "ESLint"

if [ "$SKIP_BUILD" = false ]; then
  step "4/4  Production build"
  npm run build || fail "production build"
else
  echo ""
  echo "⏭  Skipping production build (--skip-build passed)"
fi

echo ""
echo "✅  All deploy checks passed. Safe to deploy."
