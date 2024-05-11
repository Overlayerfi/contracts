// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/USDOBackingDefs.sol";
import "./AaveHandler.sol";

/**
 * @title USDOBacking
 * @notice This contract represent the backing allocation
 */
contract USDOBacking is AaveHandler {
    using SafeERC20 for IERC20;

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param usdo The USDO contract
    ///@param susdo The sUSDO contract
    constructor(
        address admin,
        address usdo,
        address susdo
    ) AaveHandler(admin, usdo, susdo) {}

    ///@notice Approve an external contract to call ERC20 transferFrom()
    ///@param asset The asset to approve
    ///@param spender The spender address
    ///@param amount The spender amount
    function approveTransfer(
        IERC20 asset,
        address spender,
        uint256 amount
    ) external onlyOwner {
        if (address(asset) == address(0)) revert ZeroAddressException();
        if (spender == address(0)) revert ZeroAddressException();
        asset.forceApprove(spender, amount);
    }

    ///@notice Recover asset from the contract
    ///@param asset The asset to approve
    ///@param amount The spender amount
    function recoverAsset(IERC20 asset, uint256 amount) external onlyOwner {
        //TODO: reject collection of core tokens: USDC, USDT, aUSDC, aUSDT
        if (address(asset) == address(0)) revert ZeroAddressException();
        asset.safeTransfer(owner(), amount);
    }
}
