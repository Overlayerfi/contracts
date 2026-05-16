#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

node check-dependency-publish-age.mjs

npm ci --legacy-peer-deps
