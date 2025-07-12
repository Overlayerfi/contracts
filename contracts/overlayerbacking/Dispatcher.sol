// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IDispatcher} from "./interfaces/IDispatcher.sol";

/**
 * @title OvaDispatcher
 * @notice This contract represent the Ova rewards dispatcher
 */
contract OvaDispatcher is Ownable, IDispatcher {
    using SafeERC20 for IERC20;
    using Math for uint256;

    error InvalidAmounts();
    error ZeroAddress();

    address public safetyModule;
    address public team;
    address public buyBack;
    address public immutable overlayerWrap;

    uint8 public teamAllocation = 10;
    uint8 public safetyModuleAllocation = 90;
    uint8 public buyBackAllocation = 0;

    constructor(
        address admin,
        address team_,
        address safetyModule_,
        address buyBack_,
        address overlayerWrap_
    ) Ownable(admin) {
        if (
            team_ == address(0) ||
            safetyModule_ == address(0) ||
            buyBack_ == address(0)
        ) {
            revert ZeroAddress();
        }
        team = team_;
        safetyModule = safetyModule_;
        buyBack = buyBack_;
        overlayerWrap = overlayerWrap_;
    }

    function setAllocations(
        uint8 teamAlloc_,
        uint8 safetyModuleAlloc_,
        uint8 buyBackAlloc_
    ) external onlyOwner {
        if (teamAlloc_ + safetyModuleAlloc_ + buyBackAlloc_ != 100) {
            revert InvalidAmounts();
        }
        teamAllocation = teamAlloc_;
        safetyModuleAllocation = safetyModuleAlloc_;
        buyBackAllocation = buyBackAlloc_;
    }

    function setTeam(address team_) external onlyOwner {
        if (team_ == address(0)) {
            revert ZeroAddress();
        }
        team = team_;
    }

    function setBuyBack(address buyBack_) external onlyOwner {
        if (buyBack_ == address(0)) {
            revert ZeroAddress();
        }
        buyBack = buyBack_;
    }

    function setSafetyModule(address safetyModule_) external onlyOwner {
        if (safetyModule_ == address(0)) {
            revert ZeroAddress();
        }
        safetyModule = safetyModule_;
    }

    function collect(address token) external onlyOwner {
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(safetyModule, bal);
    }

    function dispatch() external {
        uint256 bal = IERC20(overlayerWrap).balanceOf(address(this));
        uint256 teamAmount = bal.mulDiv(teamAllocation, 100);
        uint256 buyBackAmount = bal.mulDiv(buyBackAllocation, 100);
        uint256 safetyModuleAmount = bal - teamAmount - buyBackAmount;

        IERC20(overlayerWrap).safeTransfer(team, teamAmount);
        IERC20(overlayerWrap).safeTransfer(buyBack, buyBackAmount);
        IERC20(overlayerWrap).safeTransfer(safetyModule, safetyModuleAmount);
    }
}
