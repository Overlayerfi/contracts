// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "./GovernanceTokenBase.sol";

/**
 * @title LiquidityAirdropReward
 * @notice This token represent the airdrop token to receive the governance OVAG token.
 */
contract LiquidityAirdropReward is GovernanceTokenBase {
    ///@notice The constructor
    ///@param admin The contract admin
    constructor(address admin) GovernanceTokenBase(admin, "AOVA", "AOVA") {}

    /// @notice Token not transferable
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (from != address(0)) {
            revert OperationNotAllowed();
        }
        super._update(from, to, value);
    }
}
