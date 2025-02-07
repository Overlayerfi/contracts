// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IUSDOBackingDefs} from "./interfaces/IUSDOBackingDefs.sol";
import {IUSDO} from "./interfaces/IUSDO.sol";
import {AaveHandler} from "./AaveHandler.sol";

/**
 * @title USDOBacking
 * @notice This contract represent the backing allocations manager
 */
contract USDOBacking is AaveHandler, IUSDOBackingDefs {
    using SafeERC20 for IERC20;

    //########################################## MODIFIERS ##########################################

    modifier notProtocolAssets(address asset) {
        if (asset == USDC || asset == USDT || asset == AUSDC || asset == AUSDT)
            revert USDOBackingOperationNotAllowed();
        _;
    }

    ///@notice The constructor
    ///@dev It accepts to be the USDO collateral spender
    ///@param admin The contract admin
    ///@param treasury The contract treasury
    ///@param usdo The USDO contract
    ///@param susdo The sUSDO contract
    constructor(
        address admin,
        address treasury,
        address usdo,
        address susdo
    ) AaveHandler(admin, treasury, usdo, susdo) {
        IUSDO(usdo).acceptProposedCollateralSpender();
        emit USDOSpenderAccepted();
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Recover asset from the contract
    ///@param asset The asset to recover
    ///@param amount The spender amount
    function recoverAsset(
        address asset,
        uint256 amount
    ) external onlyOwner notProtocolAssets(asset) {
        if (asset == address(0)) revert USDOBackingZeroAddressException();
        IERC20(asset).safeTransfer(owner(), amount);
    }
}
