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

    /// @notice Error thrown when zero address is provided for staking vault or OverlayerWrap
    error OverlayerWrapSiloZeroAddressException();

    /// @notice The address of the staking vault contract
    address private immutable _STAKING_VAULT;
    /// @notice The OverlayerWrap token contract
    IERC20 private immutable _OVERLAYER_WRAP;

    /// @notice Constructor initializes the silo with staking vault and token addresses
    /// @param stakingVault Address of the staking vault contract
    /// @param OverlayerWrap Address of the OverlayerWrap token contract
    constructor(address stakingVault, address OverlayerWrap) {
        if (stakingVault == address(0) || OverlayerWrap == address(0)) {
            revert OverlayerWrapSiloZeroAddressException();
        }
        _STAKING_VAULT = stakingVault;
        _OVERLAYER_WRAP = IERC20(OverlayerWrap);
    }

    /// @notice Ensures the caller is the staking vault
    modifier onlyStakingVault() {
        if (msg.sender != _STAKING_VAULT) revert OnlyStakingVault();
        _;
    }

    /// @notice Withdraws tokens from the silo to a specified address
    /// @param to Address to receive the tokens
    /// @param amount Amount of tokens to withdraw
    function withdraw(address to, uint256 amount) external onlyStakingVault {
        _OVERLAYER_WRAP.safeTransfer(to, amount);
    }
}
