// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IDispatcher} from "./interfaces/IDispatcher.sol";

/**
 * @title OvaDispatcher
 * @notice Contract for distributing rewards among safety module, team, and buyback addresses
 */
contract OvaDispatcher is Ownable, IDispatcher {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice Error thrown when allocation percentages don't sum to 100%
    error InvalidAmounts();
    /// @notice Error thrown when zero address is provided for any critical parameter
    error ZeroAddress();

    /// @notice Address of the safety module receiving rewards
    address public safetyModule;
    /// @notice Address receiving team allocation
    address public team;
    /// @notice Address for buyback operations
    address public buyBack;
    /// @notice Address of the OverlayerWrap token contract
    address public immutable overlayerWrap;

    /* ------------- EVENTS ------------- */
    /// @notice Emitted when allocation percentages are updated
    event OvaDispatcherAllocationsUpdated(
        uint8 team,
        uint8 safetyModule,
        uint8 buyBack
    );
    /// @notice Emitted when team address is updated
    event OvaDispatcherTeamUpdated(address previous, address current);
    /// @notice Emitted when buyback address is updated
    event OvaDispatcherBuyBackUpdated(address previous, address current);
    /// @notice Emitted when safety module address is updated
    event OvaDispatcherSafetyModuleUpdated(address previous, address current);
    /// @notice Emitted when tokens are collected to safety module
    event OvaDispatcherCollected(address token, uint256 amount);
    /// @notice Emitted when rewards are dispatched
    event OvaDispatcherDispatched(
        uint256 teamAmount,
        uint256 buyBackAmount,
        uint256 safetyModuleAmount
    );

    /// @notice Percentage of rewards allocated to team (default 10%)
    uint8 public teamAllocation = 10;
    /// @notice Percentage of rewards allocated to safety module (default 90%)
    uint8 public reserveFundModuleAllocation = 90;
    /// @notice Percentage of rewards allocated to buyback (default 0%)
    uint8 public buyBackAllocation = 0;

    /// @notice Initializes the dispatcher with required addresses
    /// @param admin_ Address of contract administrator
    /// @param team_ Address receiving team allocation
    /// @param safetyModule_ Address of safety module
    /// @param buyBack_ Address for buyback operations
    /// @param overlayerWrap_ Address of OverlayerWrap token
    constructor(
        address admin_,
        address team_,
        address safetyModule_,
        address buyBack_,
        address overlayerWrap_
    ) Ownable(admin_) {
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

    /// @notice Updates reward allocation percentages
    /// @param teamAlloc_ New team allocation percentage
    /// @param reserveFundModuleAllocation_ New safety module allocation percentage
    /// @param buyBackAlloc_ New buyback allocation percentage
    /// @dev Sum of all allocations must equal 100
    function setAllocations(
        uint8 teamAlloc_,
        uint8 reserveFundModuleAllocation_,
        uint8 buyBackAlloc_
    ) external onlyOwner {
        if (teamAlloc_ + reserveFundModuleAllocation_ + buyBackAlloc_ != 100) {
            revert InvalidAmounts();
        }
        teamAllocation = teamAlloc_;
        reserveFundModuleAllocation = reserveFundModuleAllocation_;
        buyBackAllocation = buyBackAlloc_;
        emit OvaDispatcherAllocationsUpdated(
            teamAllocation,
            reserveFundModuleAllocation,
            buyBackAllocation
        );
    }

    /// @notice Updates team address
    /// @param team_ New team address
    function setTeam(address team_) external onlyOwner {
        if (team_ == address(0)) {
            revert ZeroAddress();
        }
        address previous = team;
        team = team_;
        emit OvaDispatcherTeamUpdated(previous, team);
    }

    /// @notice Updates buyback address
    /// @param buyBack_ New buyback address
    function setBuyBack(address buyBack_) external onlyOwner {
        if (buyBack_ == address(0)) {
            revert ZeroAddress();
        }
        address previous = buyBack;
        buyBack = buyBack_;
        emit OvaDispatcherBuyBackUpdated(previous, buyBack);
    }

    /// @notice Updates safety module address
    /// @param safetyModule_ New safety module address
    function setSafetyModule(address safetyModule_) external onlyOwner {
        if (safetyModule_ == address(0)) {
            revert ZeroAddress();
        }
        address previous = safetyModule;
        safetyModule = safetyModule_;
        emit OvaDispatcherSafetyModuleUpdated(previous, safetyModule);
    }

    /// @notice Collects all tokens of a specific type to the safety module
    /// @param token_ The address of the token contract
    function collect(address token_) external onlyOwner {
        uint256 bal = IERC20(token_).balanceOf(address(this));
        IERC20(token_).safeTransfer(safetyModule, bal);
        emit OvaDispatcherCollected(token_, bal);
    }

    /// @notice Dispatches rewards to team, buyback, and safety module addresses
    function dispatch() external {
        uint256 bal = IERC20(overlayerWrap).balanceOf(address(this));
        uint256 teamAmount = bal.mulDiv(teamAllocation, 100);
        uint256 buyBackAmount = bal.mulDiv(buyBackAllocation, 100);
        uint256 safetyModuleAmount = bal - teamAmount - buyBackAmount;

        IERC20(overlayerWrap).safeTransfer(team, teamAmount);
        IERC20(overlayerWrap).safeTransfer(buyBack, buyBackAmount);
        IERC20(overlayerWrap).safeTransfer(safetyModule, safetyModuleAmount);
        emit OvaDispatcherDispatched(
            teamAmount,
            buyBackAmount,
            safetyModuleAmount
        );
    }
}
