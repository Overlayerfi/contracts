// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import "./IMintRedeemManagerEvents.sol";

interface IMintRedeemManagerDefs is IMintRedeemManagerEvents {
    error MintRedeemManagerInvalidZeroAddress();
    error MintRedeemManagerInvalidDecimals();
    error MintRedeemManagerInvalidAssetAmounts();
    error MintRedeemManagerDifferentAssetsAmounts();
    error MintRedeemManagerUnsupportedAsset();
    error MintRedeemManagerMaxMintPerBlockExceeded();
    error MintRedeemManagerMaxRedeemPerBlockExceeded();
    error MintRedeemManagerSupplyAmountNotReached();
    error MintRedeemManagerInvalidMaxRedeemAmount();
    error MintRedeemManagerInvalidBenefactor();
    error MintRedeemManagerCollateralNotValid();
    error MintRedeemManagerInsufficientFunds();
}
