// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./IUSDOEvents.sol";

interface IUSDODefs is IUSDOEvents {
    /// @notice Zero address not allowed
    error USDOZeroAddressException();
    /// @notice The asset decimals can not be larger that the underlying decimals
    error USDOInvalidDecimals();
}
