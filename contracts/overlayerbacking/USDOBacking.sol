// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

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

    modifier notProtocolAssets(address asset) {
        if (asset == USDT || asset == AUSDT)
            revert OverlayerWrapBackingOperationNotAllowed();
        _;
    }

    ///@notice The constructor
    ///@dev It accepts to be the OverlayerWrap collateral spender
    ///@param admin The contract admin
    ///@param dispatcher The protocol reward dispatcher contract
    ///@param overlayerWrap The OverlayerWrap contract
    ///@param soverlayerWrap The sOverlayerWrap contract
    constructor(
        address admin,
        address dispatcher,
        address overlayerWrap,
        address soverlayerWrap
    ) AaveHandler(admin, dispatcher, overlayerWrap, soverlayerWrap) {
        IOverlayerWrap(overlayerWrap).acceptProposedCollateralSpender();
        emit OverlayerWrapSpenderAccepted();
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Recover asset from the contract
    ///@param asset The asset to recover
    ///@param amount The amount to recover
    function recoverAsset(
        address asset,
        uint256 amount
    ) external onlyOwner notProtocolAssets(asset) {
        if (asset == address(0))
            revert OverlayerWrapBackingZeroAddressException();
        IERC20(asset).safeTransfer(owner(), amount);
    }
}
