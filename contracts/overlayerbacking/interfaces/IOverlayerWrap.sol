// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "../../overlayer/types/OverlayerWrapCoreTypes.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Interface for OverlayerWrap Token
/// @notice Defines core functionality for the OverlayerWrap token
interface IOverlayerWrap is IERC20 {
    /// @notice Accept the role of collateral spender
    function acceptProposedCollateralSpender() external;
    /// @notice Mint new tokens according to the provided order
    /// @param order Struct containing minting parameters
    function mint(OverlayerWrapCoreTypes.Order calldata order) external;
}
