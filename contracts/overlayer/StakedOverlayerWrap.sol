// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable var-name-mixedcase */

import "./StakedOverlayerWrapCore.sol";
import "../overlayerbacking/interfaces/IOverlayerWrapBacking.sol";

/**
 * @title StakedOverlayerWrap
 * @notice Public interface for staking OverlayerWrap tokens following the ERC4626 standard
 */
contract StakedOverlayerWrap is StakedOverlayerWrapCore {
    using SafeERC20 for IERC20;

    /// @notice Flag to control Aave withdrawal during compound operations
    bool public withdrawAaveDuringCompound;

    /// @notice Constructor for StakedOverlayerWrap
    /// @param asset_ The OverlayerWrap token contract address
    /// @param initialRewarder_ Address authorized to distribute rewards
    /// @param admin_ Contract administrator address
    constructor(
        IERC20 asset_,
        address initialRewarder_,
        address admin_
    ) StakedOverlayerWrapCore(asset_, initialRewarder_, admin_) {
        withdrawAaveDuringCompound = true;
    }

    /**
     * @dev See {IERC4626-mint}.
     */
    function mint(
        uint256 shares_,
        address receiver_
    ) public virtual override returns (uint256) {
        _compound();
        return super.mint(shares_, receiver_);
    }

    /**
     * @dev See {IERC4626-deposit}.
     */
    function deposit(
        uint256 assets_,
        address receiver_
    ) public virtual override returns (uint256) {
        _compound();
        return super.deposit(assets_, receiver_);
    }

    /**
     * @dev See {IERC4626-withdraw}.
     */
    function withdraw(
        uint256 assets_,
        address receiver_,
        address owner_
    ) public virtual override returns (uint256) {
        _compound();
        return super.withdraw(assets_, receiver_, owner_);
    }

    /**
     * @dev See {IERC4626-redeem}.
     */
    function redeem(
        uint256 shares_,
        address receiver_,
        address owner_
    ) public virtual override returns (uint256) {
        _compound();
        return super.redeem(shares_, receiver_, owner_);
    }

    /// @notice Compounds yield from the overlayerWrap backing contract, reverting on failures
    function _compound() internal {
        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }
    }

    /// @notice Controls whether Aave tokens should be withdrawn during compound operations
    /// @param doWithdraw_ True to enable Aave withdrawals, false to disable
    /// @dev Can only be called by contract admin
    function setWithdrawAaveDuringCompound(
        bool doWithdraw_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        withdrawAaveDuringCompound = doWithdraw_;
        emit StakedOverlayerWrapWithdrawAaveDuringCompoundSet(doWithdraw_);
    }
}
