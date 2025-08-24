// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title Interface for Staked OverlayerWrap
/// @notice Defines reward transfer functionality for staked tokens
interface IsOverlayerWrap {
    /// @notice Transfer rewards to the staking contract
    /// @param amount Amount of rewards to transfer
    function transferInRewards(uint256 amount) external;
}
