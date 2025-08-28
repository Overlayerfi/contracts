// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

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
    /// @param stakingVault_ Address of the staking vault contract
    /// @param overlayerWrap_ Address of the OverlayerWrap token contract
    constructor(address stakingVault_, address overlayerWrap_) {
        if (stakingVault_ == address(0) || overlayerWrap_ == address(0)) {
            revert OverlayerWrapSiloZeroAddressException();
        }
        _STAKING_VAULT = stakingVault_;
        _OVERLAYER_WRAP = IERC20(overlayerWrap_);
    }

    /// @notice Ensures the caller is the staking vault
    modifier onlyStakingVault() {
        if (msg.sender != _STAKING_VAULT) revert OnlyStakingVault();
        _;
    }

    /// @notice Withdraws tokens from the silo to a specified address
    /// @param to_ Address to_ receive the tokens
    /// @param amount_ amount_ of tokens to_ withdraw
    function withdraw(address to_, uint256 amount_) external onlyStakingVault {
        _OVERLAYER_WRAP.safeTransfer(to_, amount_);
    }
}
