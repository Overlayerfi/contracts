// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "./MintableTokenBase.sol";

/**
 * @title OVA
 * @notice This token represent the governance OVAG token.
 */
contract OVA is MintableTokenBase {
    ///@notice The constructor
    ///@param admin_ The contract admin
    constructor(address admin_) MintableTokenBase(admin_, "OVA", "OVA") {}
}
