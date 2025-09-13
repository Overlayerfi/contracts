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
        if (asset_ == usdt || asset_ == aUsdt)
            revert OverlayerWrapBackingOperationNotAllowed();
        _;
    }

    /**
     * @notice Initializes the OverlayerWrapBacking contract.
     * @param admin_ The address of the contract administrator.
     * @param dispatcher_ The address of the rewards dispatcher contract.
     * @param overlayerWrap_ The address of the OverlayerWrap token contract.
     * @param sOverlayerWrap_ The address of the Staked OverlayerWrap contract.
     * @param aave_ The address of the Aave protocol contract.
     * @param usdt_ The address of the USDT token contract.
     * @param aUsdt_ The address of the aUSDT (Aave interest-bearing USDT) token contract.
     * @dev This constructor sets up the contract and passes all parameters to the AaveHandler base contract.
     */
    constructor(
        address admin_,
        address dispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_,
        address aave_,
        address usdt_,
        address aUsdt_
    )
        AaveHandler(
            admin_,
            dispatcher_,
            overlayerWrap_,
            sOverlayerWrap_,
            aave_,
            usdt_,
            aUsdt_
        )
    {}

    /// @notice Approves self as collateral spender of an overlayer token
    function acceptCollateralSpender() external onlyOwner {
        IOverlayerWrap(overlayerWrap).acceptProposedCollateralSpender();
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
        emit OverlayerWrapBackingAssetRecovered(asset_, amount_);
    }
}
