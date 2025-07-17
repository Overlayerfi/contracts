// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import "./IMintRedeemManagerEvents.sol";

/// @title IMintRedeemManagerDefs Interface
/// @notice Defines the error cases for the mint and redeem operations
interface IMintRedeemManagerDefs is IMintRedeemManagerEvents {
    /// @notice Thrown when an address parameter that must be non-zero is zero
    error MintRedeemManagerInvalidZeroAddress();

    /// @notice Thrown when token decimals are invalid (e.g., zero)
    error MintRedeemManagerInvalidDecimals();

    /// @notice Thrown when the provided asset amounts do not match the required parameters
    error MintRedeemManagerInvalidAssetAmounts();

    /// @notice Thrown when the normalized amounts of different assets are not equal
    error MintRedeemManagerDifferentAssetsAmounts();

    /// @notice Thrown when trying to use an unsupported collateral asset
    error MintRedeemManagerUnsupportedAsset();

    /// @notice Thrown when trying to mint more tokens than allowed in a single block
    error MintRedeemManagerMaxMintPerBlockExceeded();

    /// @notice Thrown when trying to redeem more tokens than allowed in a single block
    error MintRedeemManagerMaxRedeemPerBlockExceeded();

    /// @notice Thrown when the required supply amount is not reached during an operation
    error MintRedeemManagerSupplyAmountNotReached();

    /// @notice Thrown when trying to set an invalid maximum redeem amount (e.g., zero)
    error MintRedeemManagerInvalidMaxRedeemAmount();

    /// @notice Thrown when the benefactor of an operation is not the message sender
    error MintRedeemManagerInvalidBenefactor();

    /// @notice Thrown when attempting to use an invalid collateral type or in wrong mode (emergency/normal)
    error MintRedeemManagerCollateralNotValid();

    /// @notice Thrown when there are insufficient funds for an operation
    error MintRedeemManagerInsufficientFunds();
}
