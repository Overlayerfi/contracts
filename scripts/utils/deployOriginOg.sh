#!/bin/bash

# Deploys OverlayerOG only. Origin Shrimp / Dolphin / Whale are already live;
# do not use deployOrigin.sh for this.
#
# mintStartTime = Origin Dolphin/Whale public mint end:
#   1786971600 = 2026-08-17 13:00:00 UTC
# OG then stays open for 14 days (until 2026-08-31 13:00:00 UTC).

ORIGIN_NFT_INITIAL_OWNER=0xABE9A7c88107C55283A211B847F747e26Edc09ED \
ORIGIN_NFT_ROYALTY_RECEIVER=0x45FaCBb6018637A43Ec4b1Ff7467DBc811d13d75 \
ORIGIN_NFT_ROYALTY_BPS=0 \
ORIGIN_NFT_FEE_COLLECTOR=0x45FaCBb6018637A43Ec4b1Ff7467DBc811d13d75 \
ORIGIN_NFT_MINT_START_TIME=1786971600 \
ORIGIN_NFT_OG_BASE_URI=https://app.overlayer.fi/origin/og.json \
npx hardhat run scripts/utils/deployOverlayerOG.ts --network eth
