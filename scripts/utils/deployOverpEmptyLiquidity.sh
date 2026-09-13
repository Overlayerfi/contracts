#!/bin/bash

# Deploys OVERP + empty SingleStableStake (no pools) on mainnets.
# Uses OVERLAYER_HEAD_OP_KEY via hardhat networks eth / base / robinhood.
#
# Config: scripts/config/overp-empty-liquidity.config.json
# Manifest: mainnet-deployment/overp-liquidity.json
#
# Usage:
#   bash scripts/utils/deployOverpEmptyLiquidity.sh
#   NETWORKS="eth" bash scripts/utils/deployOverpEmptyLiquidity.sh
#   NETWORKS="base robinhood" bash scripts/utils/deployOverpEmptyLiquidity.sh
#   FORCE_REDEPLOY=1 bash scripts/utils/deployOverpEmptyLiquidity.sh
#   DRY_RUN=1 bash scripts/utils/deployOverpEmptyLiquidity.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

NETWORKS="${NETWORKS:-eth base robinhood}"

echo "OVERP + empty Liquidity deploy"
echo "  networks: ${NETWORKS}"
echo "  cwd:      ${ROOT}"
if [ "${DRY_RUN:-}" = "1" ] || [ "${DRY_RUN:-}" = "true" ]; then
  echo "  mode:     DRY RUN (no transactions)"
fi
echo

for net in ${NETWORKS}; do
  echo "========== ${net} =========="
  npx hardhat run scripts/utils/deployOverpEmptyLiquidity.ts --network "${net}"
  echo
done

echo "Done. Manifest: mainnet-deployment/overp-liquidity.json"
