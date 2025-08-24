// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/* solhint-disable var-name-mixedcase  */

/// @title MintRedeemManager Types Library
/// @notice Contains type definitions for minting and redeeming operations
library MintRedeemManagerTypes {
    /// @notice Structure representing a mint/redeem order
    /// @param benefactor Address providing the collateral
    /// @param beneficiary Address receiving the minted tokens
    /// @param collateral Address of the collateral token
    /// @param collateralAmount Amount of collateral tokens
    /// @param overlayerWrapAmount Amount of Overlayer Wrap tokens
    struct Order {
        address benefactor;
        address beneficiary;
        address collateral;
        uint256 collateralAmount;
        uint256 overlayerWrapAmount;
    }

    /// @notice Structure representing a stablecoin configuration
    /// @param addr Address of the stablecoin contract
    /// @param decimals Number of decimals used by the stablecoin
    struct StableCoin {
        address addr;
        uint256 decimals;
    }
}
