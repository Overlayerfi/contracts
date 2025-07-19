// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

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
import {Constants} from "./Constants.sol";
import "../overlayer/types/MintRedeemManagerTypes.sol";

/**
 * @title AaveHandler
 * @notice Aave V3 protocol position handler
 */
abstract contract AaveHandler is
    Constants,
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

    //########################################## PUBLIC STORAGE ##########################################

    /// @notice Aave Pool contract for lending operations
    address public aave = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    /// @notice Address of the protocol's reward distribution contract
    address public ovaRewardsDispatcher;
    /// @notice Total amount of USDT supplied to Aave protocol
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
    ///@param admin The contract admin
    ///@param rewardsDispatcher The protocol rewardsDispatcher contract
    ///@param overlayerWrap_ The overlayerWrap contract
    ///@param sOverlayerWrap_ The sOverlayerWrap contract
    constructor(
        address admin,
        address rewardsDispatcher,
        address overlayerWrap_,
        address sOverlayerWrap_
    ) Ownable(admin) {
        if (admin == address(0)) revert AaveHandlerZeroAddressException();
        if (rewardsDispatcher == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (sOverlayerWrap_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == sOverlayerWrap_)
            revert AaveHandlerSameAddressException();
        ovaRewardsDispatcher = rewardsDispatcher;
        overlayerWrap = overlayerWrap_;
        sOverlayerWrap = sOverlayerWrap_;

        approveAave(type(uint256).max);
        approveStakingOverlayerWrap(type(uint256).max);
        approveOverlayerWrap(type(uint256).max);
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    /// @notice Withraw funds from aave and return all the collateral to overlayerWrap. This will forward collateral in aToken mode.
    function adminWithdraw() external onlyOwner nonReentrant {
        uint256 aUsdtReceived = IERC20(AUSDT).balanceOf(address(this));

        if (aUsdtReceived < totalSuppliedUSDT) {
            revert AaveHandlerAaveWithrawFailed();
        }

        // Return collateral to protocol token
        IERC20(AUSDT).safeTransfer(overlayerWrap, totalSuppliedUSDT);

        // Send any leftover to dispatcher
        uint256 surplusAUsdt = IERC20(AUSDT).balanceOf(address(this));
        if (surplusAUsdt > 0) {
            IERC20(AUSDT).safeTransfer(ovaRewardsDispatcher, surplusAUsdt);
        }

        updateSuppliedAmounts(totalSuppliedUSDT);
    }

    /// @notice Compound funds from-to aave protocol
    /// @param withdrawAave Withdraw usdt from aave
    function compound(bool withdrawAave) external nonReentrant {
        uint256 diff = IERC20(AUSDT).balanceOf(address(this)) -
            totalSuppliedUSDT;
        uint256 scaledDiff = diff * DECIMALS_DIFF_AMOUNT;
        if (diff == 0) {
            return;
        }

        if (withdrawAave) {
            _withdrawInternalAave(diff, address(this));
        }
        // Otherwise we use aTokens directly

        MintRedeemManagerTypes.Order memory order = MintRedeemManagerTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral: withdrawAave ? USDT : AUSDT,
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
    ///@param amountUsdt Amount of USDT or aUSDT to supply
    /// @param collateral Address of the collateral token (USDT or aUSDT)
    /// @dev Only callable by OverlayerWrap contract
    function supply(
        uint256 amountUsdt,
        address collateral
    ) external onlyProtocol nonReentrant {
        if (amountUsdt > 0) {
            if (collateral == AUSDT) {
                IERC20(AUSDT).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt
                );
            } else if (collateral == USDT) {
                IERC20(USDT).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt
                );
                IPool(aave).supply(
                    USDT,
                    amountUsdt,
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
        uint256 minIncrease = Math.min(amountUsdt, differenceUsdt);
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
            IERC20(USDT).forceApprove(oldAave, 0);
        }
        IERC20(USDT).forceApprove(aave, type(uint256).max);

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
    ///@param rewardsDispatcher The new rewardsDispatcher address
    function updateRewardsDispatcher(
        address rewardsDispatcher
    ) external onlyOwner {
        if (rewardsDispatcher == address(0))
            revert AaveHandlerZeroAddressException();
        ovaRewardsDispatcher = rewardsDispatcher;
        emit AaveNewRewardsDispatcher(rewardsDispatcher);
    }

    //########################################## PUBLIC FUNCTIONS ##########################################

    ///@notice Approve aave spending
    ///@param amount The amount to allow aave as spender
    function approveAave(uint256 amount) public onlyOwner nonReentrant {
        IERC20(USDT).forceApprove(aave, amount);
    }

    ///@notice Approve Staked overlayerWrap spending
    ///@param amount The amount to allow sOverlayerWrap as spender
    function approveStakingOverlayerWrap(
        uint256 amount
    ) public onlyOwner nonReentrant {
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, amount);
    }

    ///@notice Approve overlayerWrap spending
    ///@param amount The amount to allow overlayerWrap as spender
    function approveOverlayerWrap(
        uint256 amount
    ) public onlyOwner nonReentrant {
        IERC20(USDT).forceApprove(overlayerWrap, amount);
        IERC20(AUSDT).forceApprove(overlayerWrap, amount);
    }

    /// @notice Withraw funds from aave protocol
    /// @param amountUsdt The amount to withdraw intended as USDT or their aToken version
    /// @param collateral The collateral to withdraw
    function withdraw(
        uint256 amountUsdt,
        address collateral
    ) public onlyProtocol nonReentrant {
        if (collateral == USDT) {
            _withdrawInternal(amountUsdt, msg.sender);
        } else if (collateral == AUSDT) {
            _withdrawInternalEmergency(amountUsdt, msg.sender);
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
    /// @param usdtTaken The amount of usdt removed from the backing supply
    function updateSuppliedAmounts(uint256 usdtTaken) internal {
        if (usdtTaken > totalSuppliedUSDT) {
            totalSuppliedUSDT = 0;
        } else {
            unchecked {
                totalSuppliedUSDT -= usdtTaken;
            }
        }
    }

    ///@notice Withraw funds taking aTokens directly
    ///@param amountUsdt The amount to withdraw intended as aUSDT
    ///@param recipient The collateral recipient
    function _withdrawInternalEmergency(
        uint256 amountUsdt,
        address recipient
    ) internal {
        uint256 aUsdtBal = IERC20(AUSDT).balanceOf(address(this));
        if (aUsdtBal < amountUsdt) {
            revert AaveHandlerInsufficientABalance();
        }
        IERC20(AUSDT).safeTransfer(recipient, amountUsdt);

        updateSuppliedAmounts(amountUsdt);
    }

    ///@notice Withraw funds from aave and update supply counters
    ///@param amountUsdt The amount to withdraw intended as USDT
    ///@param recipient The collateral recipient
    function _withdrawInternal(uint256 amountUsdt, address recipient) internal {
        uint256 usdtReceived = _withdrawInternalAave(amountUsdt, recipient);

        updateSuppliedAmounts(usdtReceived);
    }

    ///@notice Withraw funds to aave
    ///@param amountUsdt The amount to withdraw intended as USDT
    ///@param recipient The collateral recipient
    ///@return Amount of usdt received
    function _withdrawInternalAave(
        uint256 amountUsdt,
        address recipient
    ) internal returns (uint256) {
        if (IERC20(AUSDT).balanceOf(address(this)) < amountUsdt)
            revert AaveHandlerInsufficientBalance();
        uint256 usdtReceived = 0;
        if (amountUsdt > 0) {
            usdtReceived = IPool(aave).withdraw(USDT, amountUsdt, recipient);
        }

        if (amountUsdt != usdtReceived) {
            revert AaveHandlerAaveWithrawFailed();
        }

        emit AaveWithdraw(usdtReceived);

        return (usdtReceived);
    }
}
