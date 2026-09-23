// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal ERC-4626 vault over a MintableERC20 "GHO" for local tests (mirrors sGHO deposit/withdraw mechanics).
contract MockSghoVault is ERC4626 {
    uint256 public maxWithdrawLimit = type(uint256).max;
    uint256 public maxDepositLimit = type(uint256).max;

    constructor(IERC20 asset_) ERC20("sMockGHO", "sMockGHO") ERC4626(asset_) {}

    function setMaxWithdrawLimit(uint256 maxWithdrawLimit_) external {
        maxWithdrawLimit = maxWithdrawLimit_;
    }

    function setMaxDepositLimit(uint256 maxDepositLimit_) external {
        maxDepositLimit = maxDepositLimit_;
    }

    function maxWithdraw(
        address owner_
    ) public view override returns (uint256) {
        uint256 maxAssets = super.maxWithdraw(owner_);
        return maxAssets < maxWithdrawLimit ? maxAssets : maxWithdrawLimit;
    }

    function maxDeposit(address) public view override returns (uint256) {
        return maxDepositLimit;
    }

    function deposit(
        uint256 assets_,
        address receiver_
    ) public override returns (uint256) {
        uint256 shares = super.deposit(assets_, receiver_);
        maxDepositLimit -= assets_;
        return shares;
    }
}
