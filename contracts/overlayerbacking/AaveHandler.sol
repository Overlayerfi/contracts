// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IAaveHandlerDefs} from "./interfaces/IAaveHandlerDefs.sol";
import {IDispatcher} from "./interfaces/IDispatcher.sol";
import {IsOverlayerWrap} from "./interfaces/IsOverlayerWrap.sol";
import {IOverlayerWrap} from "./interfaces/IOverlayerWrap.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../overlayer/types/OverlayerWrapCoreTypes.sol";

/**
 * @title AaveHandler
 * @notice Aave V3 protocol position handler
 */
abstract contract AaveHandler is
    Ownable2Step,
    IAaveHandlerDefs,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    //########################################## CONSTANT ##########################################

    ///@notice aave referral code
    uint16 private constant AAVE_REFERRAL_CODE = 0;
    /// @notice the time interval needed to changed the aave contract
    uint256 public constant PROPOSAL_TIME_INTERVAL = 10 days;
    /// @notice decimals offset between overlayerWrap and usdt/ausdt
    uint256 public constant DECIMALS_DIFF_AMOUNT = 10 ** 12;

    //########################################## IMMUTABLE ##########################################

    ///@notice overlayerWrap contract address
    address public immutable overlayerWrap;
    ///@notice sOverlayerWrap contract address
    address public immutable sOverlayerWrap;
    ///@notice usdt contract address
    address public immutable usdt;
    ///@notice aUsdt contract address
    address public immutable aUsdt;

    //########################################## PUBLIC STORAGE ##########################################

    /// @notice Aave Pool contract for lending operations
    address public aave = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    /// @notice Address of the protocol's reward distribution contract
    address public ovaRewardsDispatcher;
    /// @notice Total amount of usdt supplied to Aave protocol
    uint256 public totalSuppliedUSDT;
    /// @notice Proposed new Aave pool contract address
    address public proposedAave;
    /// @notice Timestamp of last Aave contract proposal
    uint256 public aaveProposalTime;
    /// @notice Timestamp of last rewards allocation proposal
    uint256 public ovaDispatcherAllocationProposalTime;
    /// @notice Proposed percentage for dispatcher allocation
    uint8 public proposedOvaDispatcherAllocation;

    //########################################## PRIVATE STORAGE ##########################################

    ///@notice team reward allocation percentage
    uint8 public ovaDispatcherAllocation = 20;
    ///@notice overlayerWrap reward allocation percentage
    uint8 public stakedOverlayerWrapRewardsAllocation = 80;

    //########################################## MODIFIERS ##########################################

    /// @notice Ensures caller is the OverlayerWrap contract
    /// @dev Used to restrict critical functions to protocol control
    modifier onlyProtocol() {
        if (msg.sender != overlayerWrap) {
            revert AaveHandlerCallerIsNotOverlayerWrap();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin_ The contract admin
    ///@param rewardsDispatcher_ The protocol rewardsDispatcher contract
    ///@param overlayerWrap_ The overlayerWrap contract
    ///@param sOverlayerWrap_ The sOverlayerWrap contract
    constructor(
        address admin_,
        address rewardsDispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_,
        address usdt_,
        address aUsdt_
    ) Ownable(admin_) {
        if (admin_ == address(0)) revert AaveHandlerZeroAddressException();
        if (rewardsDispatcher_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (sOverlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (usdt_ == address(0)) revert AaveHandlerZeroAddressException();
        if (aUsdt_ == address(0)) revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == sOverlayerWrap_)
            revert AaveHandlerSameAddressException();
        ovaRewardsDispatcher = rewardsDispatcher_;
        overlayerWrap = overlayerWrap_;
        sOverlayerWrap = sOverlayerWrap_;
        usdt = usdt_;
        aUsdt = aUsdt_;

        approveAave(type(uint256).max);
        approveStakingOverlayerWrap(type(uint256).max);
        approveOverlayerWrap(type(uint256).max);
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    /// @notice Withraw funds from aave and return all the collateral to overlayerWrap. This will forward collateral in aToken mode.
    /// @param amount_ The amount AUSDT to withraw. Zero for max
    function adminWithdraw(uint256 amount_) external onlyOwner nonReentrant {
        uint256 aUsdtWant = amount_ == 0 ? totalSuppliedUSDT : amount_;

        if (aUsdtWant > totalSuppliedUSDT) {
            revert AaveHandlerAaveWithrawFailed();
        }

        // Return collateral to protocol token
        IERC20(aUsdt).safeTransfer(overlayerWrap, aUsdtWant);

        // Send any leftover to dispatcher
        uint256 surplusAUsdt = IERC20(aUsdt).balanceOf(address(this));
        if (surplusAUsdt > 0) {
            IERC20(aUsdt).safeTransfer(ovaRewardsDispatcher, surplusAUsdt);
        }

        updateSuppliedAmounts(aUsdtWant);
    }

    /// @notice Compound funds from-to aave protocol
    /// @param withdrawAave_ Withdraw usdt from aave
    function compound(bool withdrawAave_) external nonReentrant {
        uint256 diff = IERC20(aUsdt).balanceOf(address(this)) -
            totalSuppliedUSDT;
        if (diff == 0) {
            return;
        }
        uint256 scaledDiff = diff * DECIMALS_DIFF_AMOUNT;

        if (withdrawAave_) {
            _withdrawInternalAave(diff, address(this));
        }
        // Otherwise we use aTokens directly

        OverlayerWrapCoreTypes.Order memory order = OverlayerWrapCoreTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral: withdrawAave_ ? usdt : aUsdt,
                collateralAmount: diff,
                overlayerWrapAmount: scaledDiff
            });
        IOverlayerWrap(overlayerWrap).mint(order);

        uint256 amountToStaking = scaledDiff.mulDiv(
            stakedOverlayerWrapRewardsAllocation,
            100
        );
        IsOverlayerWrap(sOverlayerWrap).transferInRewards(amountToStaking);

        IERC20(overlayerWrap).safeTransfer(
            ovaRewardsDispatcher,
            scaledDiff - amountToStaking
        );
        IDispatcher(ovaRewardsDispatcher).dispatch();
    }

    ///@notice Supply assets to Aave protocol
    ///@param amountUsdt_ Amount of usdt or aUsdt to supply
    /// @param collateral_ Address of the collateral token (usdt or aUsdt)
    /// @dev Only callable by OverlayerWrap contract
    function supply(
        uint256 amountUsdt_,
        address collateral_
    ) external onlyProtocol nonReentrant {
        if (amountUsdt_ > 0) {
            if (collateral_ == aUsdt) {
                IERC20(aUsdt).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt_
                );
            } else if (collateral_ == usdt) {
                IERC20(usdt).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt_
                );
                IPool(aave).supply(
                    usdt,
                    amountUsdt_,
                    address(this),
                    AAVE_REFERRAL_CODE
                );
            } else {
                revert AaveHandlerInvalidCollateral();
            }
        }

        // Do not count donations to overlayerWrap: compute how much we have to increase our supply counters.
        // We cannot exceed the overlayerWrap supply.
        uint256 normalizedSupply = IOverlayerWrap(overlayerWrap).totalSupply() /
            DECIMALS_DIFF_AMOUNT;
        uint256 differenceUsdt = normalizedSupply - totalSuppliedUSDT;
        uint256 minIncrease = Math.min(amountUsdt_, differenceUsdt);
        totalSuppliedUSDT += minIncrease;

        emit AaveSupply(minIncrease);
    }

    ///@notice Propose a new aave contract
    ///@dev Can not be zero address
    ///@param aave_ The new aave contract address
    function proposeNewAave(address aave_) external onlyOwner nonReentrant {
        if (aave_ == address(0)) revert AaveHandlerZeroAddressException();
        proposedAave = aave_;
        aaveProposalTime = block.timestamp;
    }

    ///@notice Propose a new protocol dispatcher contract
    ///@dev Can not be zero address
    ///@param proposedOvaDispatcherAllocation_ The new proposed dispatcher contract
    function proposeNewOvaDispatcherAllocation(
        uint8 proposedOvaDispatcherAllocation_
    ) external onlyOwner {
        if (proposedOvaDispatcherAllocation_ > 100)
            revert AaveHandlerOperationNotAllowed();
        proposedOvaDispatcherAllocation = proposedOvaDispatcherAllocation_;
        ovaDispatcherAllocationProposalTime = block.timestamp;
    }

    ///@notice Accept the proposed aave contract
    function acceptProposedAave() external onlyOwner nonReentrant {
        if (
            aave != address(0) &&
            aaveProposalTime + PROPOSAL_TIME_INTERVAL > block.timestamp
        ) {
            revert AaveIntervalNotRespected();
        }
        address oldAave = aave;
        aave = proposedAave;
        // Remove allowance of old spender
        if (oldAave != address(0)) {
            IERC20(usdt).forceApprove(oldAave, 0);
        }
        IERC20(usdt).forceApprove(aave, type(uint256).max);

        emit AaveNewAave(aave);
    }

    ///@notice Accept the proposed team allocation
    function acceptProposedOvaDispatcherAllocation() external onlyOwner {
        if (
            ovaDispatcherAllocationProposalTime + PROPOSAL_TIME_INTERVAL >
            block.timestamp
        ) {
            revert AaveIntervalNotRespected();
        }
        ovaDispatcherAllocation = proposedOvaDispatcherAllocation;
        stakedOverlayerWrapRewardsAllocation = 100 - ovaDispatcherAllocation;

        emit AaveNewTeamAllocation(ovaDispatcherAllocation);
    }

    ///@notice Update protocol dispatcher
    ///@param rewardsDispatcher_ The new rewardsDispatcher address
    function updateRewardsDispatcher(
        address rewardsDispatcher_
    ) external onlyOwner {
        if (rewardsDispatcher_ == address(0))
            revert AaveHandlerZeroAddressException();
        ovaRewardsDispatcher = rewardsDispatcher_;
        emit AaveNewRewardsDispatcher(rewardsDispatcher_);
    }

    //########################################## PUBLIC FUNCTIONS ##########################################

    ///@notice Approve aave spending
    ///@param amount_ The amount to allow aave as spender
    function approveAave(uint256 amount_) public onlyOwner nonReentrant {
        IERC20(usdt).forceApprove(aave, amount_);
    }

    ///@notice Approve Staked overlayerWrap spending
    ///@param amount_ The amount to allow sOverlayerWrap as spender
    function approveStakingOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, amount_);
    }

    ///@notice Approve overlayerWrap spending
    ///@param amount_ The amount to allow overlayerWrap as spender
    function approveOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(usdt).forceApprove(overlayerWrap, amount_);
        IERC20(aUsdt).forceApprove(overlayerWrap, amount_);
    }

    /// @notice Withraw funds from aave protocol
    /// @param amountUsdt_ The amount to withdraw intended as usdt or their aToken version
    /// @param collateral_ The collateral to withdraw
    function withdraw(
        uint256 amountUsdt_,
        address collateral_
    ) public onlyProtocol nonReentrant {
        if (collateral_ == usdt) {
            _withdrawInternal(amountUsdt_, msg.sender);
        } else if (collateral_ == aUsdt) {
            _withdrawInternalBypassAave(amountUsdt_, msg.sender);
        } else {
            revert AaveHandlerInvalidCollateral();
        }
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    //########################################## INTERNAL FUNCTIONS ##########################################

    /// @notice Update the supplied usdt counter
    /// @param usdtTaken_ The amount of usdt removed from the backing supply
    function updateSuppliedAmounts(uint256 usdtTaken_) internal {
        if (usdtTaken_ > totalSuppliedUSDT) {
            totalSuppliedUSDT = 0;
        } else {
            unchecked {
                totalSuppliedUSDT -= usdtTaken_;
            }
        }
    }

    ///@notice Withraw funds taking aTokens directly
    ///@param amountUsdt_ The amount to withdraw intended as aUsdt
    ///@param recipient_ The collateral recipient
    function _withdrawInternalBypassAave(
        uint256 amountUsdt_,
        address recipient_
    ) internal {
        uint256 aUsdtBal = IERC20(aUsdt).balanceOf(address(this));
        if (aUsdtBal < amountUsdt_) {
            revert AaveHandlerInsufficientABalance();
        }
        IERC20(aUsdt).safeTransfer(recipient_, amountUsdt_);

        updateSuppliedAmounts(amountUsdt_);
    }

    ///@notice Withraw funds from aave and update supply counters
    ///@param amountUsdt_ The amount to withdraw intended as usdt
    ///@param recipient_ The collateral recipient
    function _withdrawInternal(
        uint256 amountUsdt_,
        address recipient_
    ) internal {
        uint256 usdtReceived = _withdrawInternalAave(amountUsdt_, recipient_);

        updateSuppliedAmounts(usdtReceived);
    }

    ///@notice Withraw funds from aave
    ///@param amountUsdt_ The amount to withdraw intended as usdt
    ///@param recipient_ The collateral recipient
    ///@return Amount of usdt received
    function _withdrawInternalAave(
        uint256 amountUsdt_,
        address recipient_
    ) internal returns (uint256) {
        if (IERC20(aUsdt).balanceOf(address(this)) < amountUsdt_)
            revert AaveHandlerInsufficientBalance();
        uint256 usdtReceived = 0;
        if (amountUsdt_ > 0) {
            usdtReceived = IPool(aave).withdraw(usdt, amountUsdt_, recipient_);
        }

        if (amountUsdt_ != usdtReceived) {
            revert AaveHandlerAaveWithrawFailed();
        }

        emit AaveWithdraw(usdtReceived);

        return (usdtReceived);
    }
}
