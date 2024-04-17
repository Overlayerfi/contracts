// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

interface IUSDxEvents {
    /// @notice This event is fired when the minter changes
    event MinterUpdated(address indexed newMinter, address indexed oldMinter);
}
