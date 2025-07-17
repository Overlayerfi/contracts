// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/// @title Interface for Overlayer Wrap Events
/// @notice Defines events related to minter role changes
interface IOverlayerWrapEvents {
    /// @notice This event is fired when the minter changes
    event MinterUpdated(address indexed newMinter, address indexed oldMinter);
}
