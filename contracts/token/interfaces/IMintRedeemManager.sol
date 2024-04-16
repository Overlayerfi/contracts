// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import "./IMintRedeemManagerDefs.sol";

interface IMintRedeemManager is IMintRedeemManagerDefs {
  struct Order {
    address benefactor;
    address beneficiary;
    address collateral_usdt;
    address collateral_usdc;
    uint256 collateral_usdt_amount;
    uint256 collateral_usdc_amount;
    uint256 usdx_amount;
  }

  struct StableCoin {
    address addr;
    uint256 decimals;
  }

  error InvalidZeroAddress();
  error InvalidDecimals();
  error InvalidAssetAddress();
  error InvalidAssetAmounts();
  error InvalidAmount();
  error UnsupportedAsset();
  error NoAssetsProvided();
  error TransferFailed();
  error MaxMintPerBlockExceeded();
  error MaxRedeemPerBlockExceeded();
}