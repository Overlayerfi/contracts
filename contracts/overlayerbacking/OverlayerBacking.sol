// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOverlayerWrapBackingDefs} from "./interfaces/IOverlayerWrapBackingDefs.sol";
import {IOverlayerWrap} from "./interfaces/IOverlayerWrap.sol";
import {AaveHandler} from "./AaveHandler.sol";

/**
 * @title OverlayerWrapBacking
 * @notice This contract represent the backing allocations manager
 */
contract OverlayerWrapBacking is AaveHandler, IOverlayerWrapBackingDefs {
    using SafeERC20 for IERC20;

    //########################################## MODIFIERS ##########################################

    /// @notice Ensures the asset is not a protocol-managed token (USDT/aUSDT)
    /// @param asset_ Address of the token to check
    modifier notProtocolAssets(address asset_) {
        if (asset_ == USDT || asset_ == AUSDT)
            revert OverlayerWrapBackingOperationNotAllowed();
        _;
    }

    /// @notice Constructor for OverlayerWrapBacking
    /// @param admin_ Address of the contract administrator
    /// @param dispatcher_ Address of the rewards dispatcher contract
    /// @param overlayerWrap_ Address of the OverlayerWrap token contract
    /// @param sOverlayerWrap_ Address of the Staked OverlayerWrap contract
    /// @dev Automatically accepts role as collateral spender for OverlayerWrap
    constructor(
        address admin_,
        address dispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_
    ) AaveHandler(admin_, dispatcher_, overlayerWrap_, sOverlayerWrap_) {
        IOverlayerWrap(overlayerWrap_).acceptProposedCollateralSpender();
        emit OverlayerWrapSpenderAccepted();
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Recover asset from the contract
    ///@param asset_ The asset to recover
    ///@param amount_ The amount to recover
    function recoverAsset(
        address asset_,
        uint256 amount_
    ) external onlyOwner notProtocolAssets(asset_) {
        if (asset_ == address(0))
            revert OverlayerWrapBackingZeroAddressException();
        IERC20(asset_).safeTransfer(owner(), amount_);
    }
}
