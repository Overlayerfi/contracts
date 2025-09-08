// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* solhint-disable var-name-mixedcase  */

import "./IOverlayerWrapCoreEvents.sol";

/// @title IOverlayerWrapCoreDefs Interface
/// @notice Defines the error cases for the mint and redeem operations
interface IOverlayerWrapCoreDefs is IOverlayerWrapCoreEvents {
    /// @notice Thrown when an address parameter that must be non-zero is zero
    error OverlayerWrapCoreInvalidZeroAddress();

    /// @notice Thrown when token decimals are invalid (e.g., zero)
    error OverlayerWrapCoreInvalidDecimals();

    /// @notice Thrown when the provided asset amounts do not match the required parameters
    error OverlayerWrapCoreInvalidAssetAmounts();

    /// @notice Thrown when the normalized amounts of different assets are not equal
    error OverlayerWrapCoreDifferentAssetsAmounts();

    /// @notice Thrown when trying to use an unsupported collateral asset
    error OverlayerWrapCoreUnsupportedAsset();

    /// @notice Thrown when trying to mint more tokens than allowed in a single block
    error OverlayerWrapCoreMaxMintPerBlockExceeded();

    /// @notice Thrown when trying to redeem more tokens than allowed in a single block
    error OverlayerWrapCoreMaxRedeemPerBlockExceeded();

    /// @notice Thrown when the required supply amount is not reached during an operation
    error OverlayerWrapCoreSupplyAmountNotReached();

    /// @notice Thrown when trying to set an invalid maximum redeem amount (e.g., zero)
    error OverlayerWrapCoreInvalidMaxRedeemAmount();

    /// @notice Thrown when the benefactor of an operation is not the message sender
    error OverlayerWrapCoreInvalidBenefactor();

    /// @notice Thrown when attempting to use an invalid collateral type or in wrong mode (emergency/normal)
    error OverlayerWrapCoreCollateralNotValid();

    /// @notice Thrown when there are insufficient funds for an operation
    error OverlayerWrapCoreInsufficientFunds();

    /// @notice Thrown when the chain id is not the hub chain id
    error OverlayerWrapCoreNotHubChainId();

    /// @notice Thrown when attempted to set a new max redeem per block value before the allowed time
    error OverlayerWrapCoreDelayNotRespected();
}
