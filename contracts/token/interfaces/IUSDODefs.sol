// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./IUSDOEvents.sol";

interface IUSDODefs is IUSDOEvents {
    /// @notice Zero address not allowed
    error ZeroAddressException();
    /// @notice It's not possible to renounce the ownership
    error CantRenounceOwnership();
    /// @notice Only the minter role can perform an action
    error OnlyMinter();
    /// @notice The asset decimals can not be larger that the underlying decimals
    error InvalidDecimals();
}
