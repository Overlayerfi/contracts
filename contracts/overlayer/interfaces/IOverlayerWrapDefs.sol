// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./IOverlayerWrapEvents.sol";
import "../types/MintRedeemManagerTypes.sol";

interface IOverlayerWrapDefs is IOverlayerWrapEvents {
    struct ConstructorParams {
        address admin;
        string name;
        string symbol;
        MintRedeemManagerTypes.StableCoin collateral;
        MintRedeemManagerTypes.StableCoin aCollateral;
        uint256 maxMintPerBlock;
        uint256 maxRedeemPerBlock;
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
