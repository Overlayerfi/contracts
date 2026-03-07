// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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
    /// @notice the time interval needed to changed the aave contract
    uint256 public constant PROPOSAL_TIME_INTERVAL = 10 days;

    //########################################## IMMUTABLE ##########################################

    ///@notice overlayerWrap contract address
    address public immutable overlayerWrap;
    ///@notice sOverlayerWrap contract address
    address public immutable sOverlayerWrap;
    ///@notice collateral contract address
    address public immutable collateral;
    ///@notice aCollateral contract address (Aave interest-bearing token)
    address public immutable aCollateral;
    /// @notice decimals offset between overlayerWrap and collateral/aCollateral
    uint256 public immutable DECIMALS_DIFF_AMOUNT;

    //########################################## PUBLIC STORAGE ##########################################

    /// @notice Aave Pool contract for lending operations
    address public aave;
    /// @notice Address of the protocol's reward distribution contract
    address public ovaRewardsDispatcher;
    /// @notice Total amount of collateral supplied to Aave protocol
    uint256 public totalSuppliedCollateral;
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

    /**
     * @notice Constructor for AaveHandler
     * @param admin_ Address of the contract administrator
     * @param rewardsDispatcher_ Address of the protocol rewards dispatcher contract
     * @param overlayerWrap_ Address of the OverlayerWrap contract
     * @param sOverlayerWrap_ Address of the Staked OverlayerWrap contract
     * @param aave_ Address of the Aave Pool contract
     * @param collateral_ Address of the collateral token contract
     * @param aCollateral_ Address of the aToken (Aave interest-bearing collateral) token contract
     */
    constructor(
        address admin_,
        address rewardsDispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_,
        address aave_,
        address collateral_,
        address aCollateral_
    ) Ownable(admin_) {
        if (admin_ == address(0)) revert AaveHandlerZeroAddressException();
        if (rewardsDispatcher_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (sOverlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (aave_ == address(0)) revert AaveHandlerZeroAddressException();
        if (collateral_ == address(0)) revert AaveHandlerZeroAddressException();
        if (aCollateral_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == sOverlayerWrap_)
            revert AaveHandlerSameAddressException();
        ovaRewardsDispatcher = rewardsDispatcher_;
        overlayerWrap = overlayerWrap_;
        sOverlayerWrap = sOverlayerWrap_;
        aave = aave_;
        collateral = collateral_;
        aCollateral = aCollateral_;

        // Calculate decimals difference between overlayerWrap and collateral
        uint8 overlayerWrapDecimals = IERC20Metadata(overlayerWrap_).decimals();
        uint8 collateralDecimals = IERC20Metadata(collateral_).decimals();
        if (overlayerWrapDecimals < collateralDecimals) {
            revert AaveHandlerInvalidDecimals();
        }
        DECIMALS_DIFF_AMOUNT =
            10 ** (overlayerWrapDecimals - collateralDecimals);

        IERC20(collateral).forceApprove(aave, type(uint256).max);
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, type(uint256).max);
        IERC20(collateral).forceApprove(overlayerWrap, type(uint256).max);
        IERC20(aCollateral).forceApprove(overlayerWrap, type(uint256).max);
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    /// @notice Withraw funds from aave and return all the collateral to overlayerWrap. This will forward collateral in aToken mode.
    /// @param amount_ The amount of aCollateral to withraw. Zero for max
    function adminWithdraw(uint256 amount_) external onlyOwner nonReentrant {
        uint256 aCollateralWant = amount_ == 0
            ? totalSuppliedCollateral
            : amount_;

        if (aCollateralWant > totalSuppliedCollateral) {
            revert AaveHandlerAaveWithrawFailed();
        }

        // Return collateral to protocol token
        IERC20(aCollateral).safeTransfer(overlayerWrap, aCollateralWant);

        // Send any leftover to dispatcher
        uint256 surplusACollateral = IERC20(aCollateral).balanceOf(
            address(this)
        );
        if (surplusACollateral > 0) {
            IERC20(aCollateral).safeTransfer(
                ovaRewardsDispatcher,
                surplusACollateral
            );
        }

        updateSuppliedAmounts(aCollateralWant);
        emit AaveAdminWithdraw(aCollateralWant);
    }

    /// @notice Compound funds from-to aave protocol
    /// @param withdrawAave_ Withdraw collateral from aave
    function compound(bool withdrawAave_) external nonReentrant {
        uint256 aCollateralBal = IERC20(aCollateral).balanceOf(address(this));
        if (aCollateralBal <= totalSuppliedCollateral) return;
        uint256 diff = aCollateralBal - totalSuppliedCollateral;
        uint256 scaledDiff = diff.mulDiv(DECIMALS_DIFF_AMOUNT, 1);

        if (withdrawAave_) {
            _withdrawInternalAave(diff, address(this));
        }
        // Otherwise we use aTokens directly

        OverlayerWrapCoreTypes.Order memory order = OverlayerWrapCoreTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral: withdrawAave_ ? collateral : aCollateral,
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

    /// @notice Supply assets to Aave protocol
    /// @param amountCollateral_ Amount of collateral or aCollateral to supply
    /// @param collateralToken_ Address of the collateral token (collateral or aCollateral)
    /// @dev Only callable by OverlayerWrap contract
    function supply(
        uint256 amountCollateral_,
        address collateralToken_
    ) external onlyProtocol nonReentrant {
        if (amountCollateral_ > 0) {
            if (collateralToken_ == aCollateral) {
                IERC20(aCollateral).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountCollateral_
                );
            } else if (collateralToken_ == collateral) {
                IERC20(collateral).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountCollateral_
                );
                IPool(aave).supply(
                    collateral,
                    amountCollateral_,
                    address(this),
                    AAVE_REFERRAL_CODE
                );
            } else {
                revert AaveHandlerInvalidCollateral();
            }
        }

        // Do not count donations to overlayerWrap: compute how much we have to increase our supply counters.
        // We cannot exceed the overlayerWrap supply.
        // Add totalBridgedOut to compensate for OFT cross-chain burns that reduce local totalSupply.
        uint256 owTotalSupp = IOverlayerWrap(overlayerWrap).totalSupply() +
            IOverlayerWrap(overlayerWrap).totalBridgedOut();
        if (owTotalSupp < DECIMALS_DIFF_AMOUNT)
            revert AaveHandlerOverlayerWrapTotalSupplyTooLow();
        uint256 normalizedSupply = owTotalSupp / DECIMALS_DIFF_AMOUNT;
        uint256 differenceCollateral = normalizedSupply -
            totalSuppliedCollateral;
        uint256 minIncrease = Math.min(amountCollateral_, differenceCollateral);
        totalSuppliedCollateral += minIncrease;

        emit AaveSupply(minIncrease);
    }

    ///@notice Propose a new aave contract
    ///@dev Can not be zero address
    ///@param aave_ The new aave contract address
    function proposeNewAave(address aave_) external onlyOwner nonReentrant {
        if (aave_ == address(0)) revert AaveHandlerZeroAddressException();
        proposedAave = aave_;
        aaveProposalTime = block.timestamp;
        emit AaveProposedNewAave(aave_, block.timestamp);
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
        emit AaveProposedNewOvaDispatcherAllocation(
            proposedOvaDispatcherAllocation_,
            block.timestamp
        );
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
            IERC20(collateral).forceApprove(oldAave, 0);
        }
        IERC20(collateral).forceApprove(aave, type(uint256).max);

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
        IERC20(collateral).forceApprove(aave, amount_);
        emit AaveApprovalUpdated(aave, amount_);
    }

    ///@notice Approve Staked overlayerWrap spending
    ///@param amount_ The amount to allow sOverlayerWrap as spender
    function approveStakingOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, amount_);
        emit AaveStakingApprovalUpdated(sOverlayerWrap, amount_);
    }

    ///@notice Approve overlayerWrap spending
    ///@param amount_ The amount to allow overlayerWrap as spender
    function approveOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(collateral).forceApprove(overlayerWrap, amount_);
        IERC20(aCollateral).forceApprove(overlayerWrap, amount_);
        emit AaveOverlayerWrapApprovalUpdated(amount_);
    }

    /// @notice Withraw funds from aave protocol
    /// @param amountCollateral_ The amount to withdraw intended as collateral or their aToken version
    /// @param collateralToken_ The collateral to withdraw
    function withdraw(
        uint256 amountCollateral_,
        address collateralToken_
    ) public onlyProtocol nonReentrant {
        if (collateralToken_ == collateral) {
            _withdrawInternal(amountCollateral_, msg.sender);
        } else if (collateralToken_ == aCollateral) {
            _withdrawInternalBypassAave(amountCollateral_, msg.sender);
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

    /// @notice Update the supplied collateral counter
    /// @param collateralTaken_ The amount of collateral removed from the backing supply
    function updateSuppliedAmounts(uint256 collateralTaken_) internal {
        if (collateralTaken_ > totalSuppliedCollateral) {
            totalSuppliedCollateral = 0;
        } else {
            unchecked {
                totalSuppliedCollateral -= collateralTaken_;
            }
        }
    }

    ///@notice Withraw funds taking aTokens directly
    ///@param amountCollateral_ The amount to withdraw intended as aCollateral
    ///@param recipient_ The collateral recipient
    function _withdrawInternalBypassAave(
        uint256 amountCollateral_,
        address recipient_
    ) internal {
        uint256 aCollateralBal = IERC20(aCollateral).balanceOf(address(this));
        if (aCollateralBal < amountCollateral_) {
            revert AaveHandlerInsufficientABalance();
        }
        IERC20(aCollateral).safeTransfer(recipient_, amountCollateral_);

        updateSuppliedAmounts(amountCollateral_);
    }

    ///@notice Withraw funds from aave and update supply counters
    ///@param amountCollateral_ The amount to withdraw intended as collateral
    ///@param recipient_ The collateral recipient
    function _withdrawInternal(
        uint256 amountCollateral_,
        address recipient_
    ) internal {
        uint256 collateralReceived = _withdrawInternalAave(
            amountCollateral_,
            recipient_
        );

        updateSuppliedAmounts(collateralReceived);
    }

    ///@notice Withraw funds from aave
    ///@param amountCollateral_ The amount to withdraw intended as collateral
    ///@param recipient_ The collateral recipient
    ///@return Amount of collateral received
    function _withdrawInternalAave(
        uint256 amountCollateral_,
        address recipient_
    ) internal returns (uint256) {
        if (IERC20(aCollateral).balanceOf(address(this)) < amountCollateral_)
            revert AaveHandlerInsufficientBalance();
        uint256 collateralReceived = 0;
        if (amountCollateral_ > 0) {
            collateralReceived = IPool(aave).withdraw(
                collateral,
                amountCollateral_,
                recipient_
            );
        }

        if (amountCollateral_ != collateralReceived) {
            revert AaveHandlerAaveWithrawFailed();
        }

        emit AaveWithdraw(collateralReceived);

        return (collateralReceived);
    }
}
