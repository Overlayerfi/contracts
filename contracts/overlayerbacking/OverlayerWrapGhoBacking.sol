// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOverlayerWrapBackingDefs} from "./interfaces/IOverlayerWrapBackingDefs.sol";
import {IOverlayerWrap} from "./interfaces/IOverlayerWrap.sol";
import {GhoSghoHandler} from "./GhoSghoHandler.sol";

/**
 * @title OverlayerWrapGhoBacking
 * @notice Backing manager for a GHO-denominated OverlayerWrap whose collateral is deployed into an sGHO-style ERC-4626 vault.
 */
contract OverlayerWrapGhoBacking is GhoSghoHandler, IOverlayerWrapBackingDefs {
    using SafeERC20 for IERC20;

    modifier notProtocolAssets(address asset_) {
        if (asset_ == collateral || asset_ == aCollateral) {
            revert OverlayerWrapBackingOperationNotAllowed();
        }
        _;
    }

    constructor(
        address admin_,
        address dispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_,
        address collateral_,
        address aCollateral_
    )
        GhoSghoHandler(
            admin_,
            dispatcher_,
            overlayerWrap_,
            sOverlayerWrap_,
            collateral_,
            aCollateral_
        )
    {}

    function acceptCollateralSpender() external onlyOwner {
        IOverlayerWrap(overlayerWrap).acceptProposedCollateralSpender();
        emit OverlayerWrapSpenderAccepted();
    }

    function recoverAsset(
        address asset_,
        uint256 amount_
    ) external onlyOwner notProtocolAssets(asset_) {
        if (asset_ == address(0))
            revert OverlayerWrapBackingZeroAddressException();
        IERC20(asset_).safeTransfer(owner(), amount_);
        emit OverlayerWrapBackingAssetRecovered(asset_, amount_);
    }
}
