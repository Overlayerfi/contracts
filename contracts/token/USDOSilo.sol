// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUSDOSiloDefinitions.sol";

/**
 * @title USDOSilo
 * @notice The Silo allows to store USDO during the stake cooldown process.
 */
contract USDOSilo is IUSDOSiloDefinitions {
    address private immutable _STAKING_VAULT;
    IERC20 private immutable _USDO;

    constructor(address stakingVault, address USDO) {
        _STAKING_VAULT = stakingVault;
        _USDO = IERC20(USDO);
    }

    modifier onlyStakingVault() {
        if (msg.sender != _STAKING_VAULT) revert OnlyStakingVault();
        _;
    }

    function withdraw(address to, uint256 amount) external onlyStakingVault {
        _USDO.transfer(to, amount);
    }
}
