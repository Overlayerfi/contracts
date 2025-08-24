// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title OvaWhitelist Contract
/// @notice This contract manages a whitelist of addresses, allowing the owner to add or remove addresses.
/// @dev Uses OpenZeppelin's Ownable contract for access control.
contract OvaWhitelist is Ownable {
    /// @notice Mapping of addresses to their whitelist status.
    mapping(address => bool) public whitelist;

    /// @notice Tracks the number of whitelisted users.
    uint256 public users;

    /// @notice Initializes the contract and sets the owner.
    /// @param admin The address that will be assigned as the owner.
    constructor(address admin) Ownable(admin) {}

    /// @notice Adds an address to the whitelist.
    /// @dev Only the owner can call this function.
    /// @param who The address to be added to the whitelist.
    function add(address who) public onlyOwner {
        if (!whitelist[who]) {
            whitelist[who] = true;
            unchecked {
                users += 1;
            }
        }
    }

    /// @notice Removes an address from the whitelist.
    /// @dev Only the owner can call this function.
    /// @param who The address to be removed from the whitelist.
    function remove(address who) external onlyOwner {
        if (whitelist[who]) {
            whitelist[who] = false;
            unchecked {
                users -= 1;
            }
        }
    }

    /// @notice Batch add addresses
    /// @param addresses The addresses to be added to the whitelist.
    function batchAdd(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            add(addresses[i]);
        }
    }
}
