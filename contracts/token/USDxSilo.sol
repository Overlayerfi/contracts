// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import './interfaces/IUSDxSiloDefinitions.sol';

/**
 * @title USDxSilo
 * @notice The Silo allows to store USDx during the stake cooldown process.
 */
contract USDxSilo is IUSDxSiloDefinitions {
    address immutable _STAKING_VAULT;
    IERC20 immutable _USDX;

    constructor(address stakingVault, address usde) {
        _STAKING_VAULT = stakingVault;
        _USDX = IERC20(usde);
    }

    modifier onlyStakingVault() {
        if (msg.sender != _STAKING_VAULT) revert OnlyStakingVault();
        _;
    }

    function withdraw(address to, uint256 amount) external onlyStakingVault {
        _USDX.transfer(to, amount);
    }
}
