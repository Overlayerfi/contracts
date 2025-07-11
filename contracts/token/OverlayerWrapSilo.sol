// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase  */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IOverlayerWrapSiloDefinitions.sol";

/**
 * @title OverlayerWrapSilo
 * @notice The Silo allows to store OverlayerWrap during the stake cooldown process.
 */
contract OverlayerWrapSilo is IOverlayerWrapSiloDefinitions {
    using SafeERC20 for IERC20;

    error OverlayerWrapSiloZeroAddressException();

    address private immutable _STAKING_VAULT;
    IERC20 private immutable _OverlayerWrap;

    constructor(address stakingVault, address OverlayerWrap) {
        if (stakingVault == address(0) || OverlayerWrap == address(0)) {
            revert OverlayerWrapSiloZeroAddressException();
        }
        _STAKING_VAULT = stakingVault;
        _OverlayerWrap = IERC20(OverlayerWrap);
    }

    modifier onlyStakingVault() {
        if (msg.sender != _STAKING_VAULT) revert OnlyStakingVault();
        _;
    }

    function withdraw(address to, uint256 amount) external onlyStakingVault {
        _OverlayerWrap.safeTransfer(to, amount);
    }
}
