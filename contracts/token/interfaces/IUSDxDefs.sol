// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import './IUSDxEvents.sol';

interface IUSDxDefs is IUSDxEvents {
    /// @notice Zero address not allowed
    error ZeroAddressException();
    /// @notice It's not possible to renounce the ownership
    error CantRenounceOwnership();
    /// @notice Only the minter role can perform an action
    error OnlyMinter();
}
