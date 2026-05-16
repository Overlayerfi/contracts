#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm install --package-lock-only --legacy-peer-deps

node check-dependency-publish-age.mjs

npm ci --legacy-peer-deps
