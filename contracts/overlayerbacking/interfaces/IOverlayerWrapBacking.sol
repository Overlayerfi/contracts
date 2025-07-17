// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/// @title Interface for OverlayerWrap Backing
/// @notice Defines core functionality for backing system
interface IOverlayerWrapBacking {
    /// @notice Performs compound operation on backing assets
    /// @param withdrawAave Whether to withdraw from Aave during compounding
    function compound(bool withdrawAave) external;
}
