// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";

/**
 * @title OVA
 * @notice This token represent the governance OVAG token.
 */
contract OVA is GovernanceTokenBase {
    ///@notice The constructor
    ///@param admin The contract admin
    constructor(address admin) GovernanceTokenBase(admin, "OVA", "OVA") {}
}
