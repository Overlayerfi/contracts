// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import './IMintRedeemManagerEvents.sol';

interface IMintRedeemManagerDefs is IMintRedeemManagerEvents {
    error InvalidZeroAddress();
    error InvalidDecimals();
    error InvalidAssetAddress();
    error InvalidAssetAmounts();
    error UnsupportedAsset();
    error NoAssetsProvided();
    error TransferFailed();
    error MaxMintPerBlockExceeded();
    error MaxRedeemPerBlockExceeded();
}
