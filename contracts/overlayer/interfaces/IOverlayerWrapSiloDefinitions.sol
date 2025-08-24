// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/// @title Interface for Overlayer Wrap Silo Definitions
/// @notice Defines access control for staking vault operations
interface IOverlayerWrapSiloDefinitions {
    /// @notice Error emitted when the staking vault is not the caller
    error OnlyStakingVault();
}
