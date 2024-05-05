// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";

/**
 * @title OBSI
 * @notice This token represent the governance OBSI token.
 */
contract OBSI is GovernanceTokenBase {

    ///@notice The constructor
    ///@param admin The contract admin
    constructor(
        address admin
    ) GovernanceTokenBase(admin, "OBSI", "OBSI") {}
}
