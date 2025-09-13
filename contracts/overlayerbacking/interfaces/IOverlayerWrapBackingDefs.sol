// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title Interface for OverlayerWrap Backing Definitions
/// @notice Defines core errors and events for the backing system
interface IOverlayerWrapBackingDefs {
    /// @notice Error thrown when zero address is provided
    error OverlayerWrapBackingZeroAddressException();

    /// @notice Error thrown when attempting to renounce ownership
    error OverlayerWrapBackingCantRenounceOwnership();

    /// @notice Error thrown when operation is not permitted
    error OverlayerWrapBackingOperationNotAllowed();

    /// @notice Emitted when spender role is accepted
    event OverlayerWrapSpenderAccepted();

    /// @notice Emitted when admin recover an allowed token from this contract
    event OverlayerWrapBackingAssetRecovered(address, uint256);
}
