// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./IOverlayerWrapEvents.sol";
import "../types/OverlayerWrapCoreTypes.sol";

/// @title Interface for Overlayer Wrap Definitions
/// @notice Defines the core structures and events for the Overlayer Wrap system
interface IOverlayerWrapDefs is IOverlayerWrapEvents {
    /// @notice Parameters required for constructing the Overlayer Wrap contract
    /// @param admin Address of the contract administrator
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param collateral Stablecoin used as collateral
    /// @param aCollateral Associated collateral token
    /// @param maxMintPerBlock Maximum amount that can be minted per block
    /// @param maxRedeemPerBlock Maximum amount that can be redeemed per block
    /// @param hubChainId The parent chain id
    struct ConstructorParams {
        address admin;
        address lzEndpoint;
        string name;
        string symbol;
        OverlayerWrapCoreTypes.StableCoin collateral;
        OverlayerWrapCoreTypes.StableCoin aCollateral;
        uint256 maxMintPerBlock;
        uint256 maxRedeemPerBlock;
        uint256 hubChainId;
    }
    /// @notice Zero address not allowed
    error OverlayerWrapZeroAddressException();
    /// @notice The asset decimals can not be larger that the underlying decimals
    error OverlayerWrapInvalidDecimals();
    /// @notice An account has been disabled from performing transactions
    error OverlayerWrapAccountDisabled();
    /// @notice Blacklist not active
    error OverlayerWrapBlacklistNotActive();
    /// @notice Blacklist time not valid
    error OverlayerWrapBlacklistTimeNotValid();
    /// @notice A blacklist event
    event DisableAccount(address account);
    /// @notice A reverted blacklist event
    event EnableAccount(address account);
}
