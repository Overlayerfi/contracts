// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/// @title IOverlayerWrapBacking Interface
/// @notice Interface for managing collateral backing for the OverlayerWrap token
interface IOverlayerWrapBacking {
    /// @notice Supply collateral to the backing contract
    /// @param amount The amount of collateral to supply
    /// @param collateral The address of the collateral token
    function supply(uint256 amount, address collateral) external;

    /// @notice Withdraw collateral from the backing contract
    /// @param amount The amount of collateral to withdraw
    /// @param collateral The address of the collateral token to withdraw
    function withdraw(uint256 amount, address collateral) external;
}
