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
import "../token/types/MintRedeemManagerTypes.sol";

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

    ///@notice AAVE referral code
    uint16 private constant AAVE_REFERRAL_CODE = 0;
    /// @notice the time interval needed to changed the AAVE contract
    uint256 public constant PROPOSAL_TIME_INTERVAL = 10 days;
    /// @notice decimals offset between overlayerWrap and usdt/ausdt
    uint256 public constant DECIMALS_DIFF_AMOUNT = 10 ** 12;

    //########################################## IMMUTABLE ##########################################

    ///@notice OverlayerWrap contract address
    address public immutable OverlayerWrap;
    ///@notice sOverlayerWrap contract address
    address public immutable sOverlayerWrap;

    //########################################## PUBLIC STORAGE ##########################################

    ///@notice AAVE protocl Pool.sol contract address
    address public AAVE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    ///@notice Protocol rewardsDispatcher
    address public OVA_REWARDS_DISPATCHER;
    ///@notice Amount of total supplied USDT
    uint256 public totalSuppliedUSDT;
    /// @notice the proposed new spender
    address public proposedAave;
    /// @notice the last aave proposal time
    uint256 public aaveProposalTime;
    /// @notice the last team allocation proposal time
    uint256 public ovaDispatcherAllocationProposalTime;
    /// @notice the proposed team allocation percentage
    uint8 public proposedOvaDispatcherAllocation;

    //########################################## PRIVATE STORAGE ##########################################

    ///@notice team reward allocation percentage
    uint8 public ovaDispatcherAllocation = 20;
    ///@notice overlayerWrap reward allocation percentage
    uint8 public stakedOverlayerWrapRewardsAllocation = 80;

    //########################################## MODIFIERS ##########################################

    modifier onlyProtocol() {
        if (msg.sender != OverlayerWrap) {
            revert AaveHandlerCallerIsNotOverlayerWrap();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param rewardsDispatcher The protocol rewardsDispatcher contract
    ///@param overlayerWrap The OverlayerWrap contract
    ///@param overlayerWrap The sOverlayerWrap contract
    constructor(
        address admin,
        address rewardsDispatcher,
        address overlayerWrap,
        address soverlayerWrap
    ) Ownable(admin) {
        if (admin == address(0)) revert AaveHandlerZeroAddressException();
        if (rewardsDispatcher == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap == address(0)) revert AaveHandlerZeroAddressException();
        if (soverlayerWrap == address(0)) revert AaveHandlerZeroAddressException();
        if (overlayerWrap == soverlayerWrap) revert AaveHandlerSameAddressException();
        OVA_REWARDS_DISPATCHER = rewardsDispatcher;
        OverlayerWrap = overlayerWrap;
        sOverlayerWrap = soverlayerWrap;

        //approve AAVE
        approveAave(type(uint256).max);

        //approve OverlayerWrap staking contract
        approveStakingOverlayerWrap(type(uint256).max);

        //approve OverlayerWrap contract
        approveOverlayerWrap(type(uint256).max);
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Withraw funds from aave and return all the collateral to OverlayerWrap
    function adminWithdraw() external onlyOwner nonReentrant {
        uint256 usdtReceived = 0;
        bool isEmergencyMode = IOverlayerWrap(OverlayerWrap).emergencyMode();

        if (!isEmergencyMode) {
            usdtReceived = IPool(AAVE).withdraw(
                USDT,
                IERC20(AUSDT).balanceOf(address(this)),
                address(this)
            );
        } else {
            usdtReceived = IERC20(AUSDT).balanceOf(address(this));
        }

        if (
            usdtReceived < totalSuppliedUSDT
        ) {
            revert AaveHandlerAaveWithrawFailed();
        }

        // Return collateral to protocol token
        IERC20(isEmergencyMode ? AUSDT : USDT).safeTransfer(
            OverlayerWrap,
            totalSuppliedUSDT
        );

        if (usdtReceived > totalSuppliedUSDT) {
            uint256 usdtDiff = 0;
            unchecked {
                usdtDiff = usdtReceived - totalSuppliedUSDT;
            }
            if (usdtDiff > 0) {
                IERC20(isEmergencyMode ? AUSDT : USDT).safeTransfer(
                    OVA_REWARDS_DISPATCHER,
                    usdtDiff
                );
            }
        }

        // Reset state
        totalSuppliedUSDT = 0;
    }

    ///@notice Compound funds from-to AAVE protocol
    function compound() external nonReentrant {
        bool isEmergencyMode = IOverlayerWrap(OverlayerWrap).emergencyMode();

        uint256 diff = IERC20(AUSDT).balanceOf(address(this)) -
            totalSuppliedUSDT;
        uint256 scaledDiff = diff * DECIMALS_DIFF_AMOUNT;
        if (diff == 0) {
            return;
        }

        if (!isEmergencyMode) {
            _withdrawInternalAave(
                diff,
                address(this)
            );
        }
        // Otherwise we use aTokens directly

        MintRedeemManagerTypes.Order memory order = MintRedeemManagerTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral: isEmergencyMode ? AUSDT : USDT,
                collateral_amount: diff,
                overlayerWrap_amount: scaledDiff
            });
        IOverlayerWrap(OverlayerWrap).mint(order);

        uint256 amountToStaking = scaledDiff.mulDiv(
            stakedOverlayerWrapRewardsAllocation,
            100
        );
        IsOverlayerWrap(sOverlayerWrap).transferInRewards(amountToStaking);

        IERC20(OverlayerWrap).safeTransfer(
            OVA_REWARDS_DISPATCHER,
            scaledDiff - amountToStaking
        );
        IDispatcher(OVA_REWARDS_DISPATCHER).dispatch();
    }

    ///@notice Supply funds to AAVE protocol
    ///@param amountUsdt The amount to supply intended as USDT or their aToken version
    function supply(
        uint256 amountUsdt
    ) external onlyProtocol nonReentrant {
        bool isEmergencyMode = IOverlayerWrap(OverlayerWrap).emergencyMode();
        if (amountUsdt > 0) {
            if (isEmergencyMode) {
                IERC20(AUSDT).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt
                );
            } else {
                IERC20(USDT).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdt
                );
                IPool(AAVE).supply(
                    USDT,
                    amountUsdt,
                    address(this),
                    AAVE_REFERRAL_CODE
                );
            }
        }

        // Do not count donations: compute how much we have to increase our supply counters.
        // We cannot exceed the OverlayerWrap supply.
        uint256 normalizedSupply = IOverlayerWrap(OverlayerWrap).totalSupply() /
            DECIMALS_DIFF_AMOUNT;
        uint256 differenceUsdt = normalizedSupply - totalSuppliedUSDT;
        if (differenceUsdt > amountUsdt) {
            revert AaveHandlerUnexpectedAmount();
        }
        totalSuppliedUSDT += Math.min(amountUsdt, differenceUsdt);

        emit AaveSupply(amountUsdt);
    }

    ///@notice Propose a new aave contract
    ///@dev Can not be zero address
    ///@param aave The new aave contract address
    function proposeNewAave(address aave) external onlyOwner nonReentrant {
        if (aave == address(0)) revert AaveHandlerZeroAddressException();
        proposedAave = aave;
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

    ///@notice Accept the proposed AAVE contract
    function acceptProposedAave() external onlyOwner nonReentrant {
        if (
            AAVE != address(0) &&
            aaveProposalTime + PROPOSAL_TIME_INTERVAL > block.timestamp
        ) {
            revert AaveIntervalNotRespected();
        }
        address oldAave = AAVE;
        AAVE = proposedAave;
        // Remove allowance of old spender
        if (oldAave != address(0)) {
            IERC20(USDT).forceApprove(oldAave, 0);
        }
        IERC20(USDT).forceApprove(AAVE, type(uint256).max);

        emit AaveNewAave(AAVE);
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
        OVA_REWARDS_DISPATCHER = rewardsDispatcher;
        emit AaveNewRewardsDispatcher(rewardsDispatcher);
    }

    //########################################## PUBLIC FUNCTIONS ##########################################

    ///@notice Approve aave spending
    ///@param amount The amount to allow aave as spender
    function approveAave(uint256 amount) public onlyOwner nonReentrant {
        IERC20(USDT).forceApprove(AAVE, amount);
    }

    ///@notice Approve Staked OverlayerWrap spending
    ///@param amount The amount to allow sOverlayerWrap as spender
    function approveStakingOverlayerWrap(uint256 amount) public onlyOwner nonReentrant {
        IERC20(OverlayerWrap).forceApprove(sOverlayerWrap, amount);
    }

    ///@notice Approve OverlayerWrap spending
    ///@param amount The amount to allow OverlayerWrap as spender
    function approveOverlayerWrap(uint256 amount) public onlyOwner nonReentrant {
        IERC20(USDT).forceApprove(OverlayerWrap, amount);
        IERC20(AUSDT).forceApprove(OverlayerWrap, amount);
    }

    ///@notice Withraw funds from aave protocol
    ///@param amountUsdt The amount to withdraw intended as USDT or their aToken version
    function withdraw(
        uint256 amountUsdt
    ) public onlyProtocol nonReentrant {
        bool isEmergencyMode = IOverlayerWrap(OverlayerWrap).emergencyMode();
        if (!isEmergencyMode) {
            _withdrawInternal(amountUsdt, msg.sender);
        } else {
            _withdrawInternalEmergency(amountUsdt, msg.sender);
        }
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    //########################################## INTERNAL FUNCTIONS ##########################################

    /// @notice Update the supplied usdc and usdt counter
    /// @param usdtTaken The amount of usdt removed from the backing supply
    function updateSuppliedAmounts(
        uint256 usdtTaken
    ) internal {
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
    function _withdrawInternal(
        uint256 amountUsdt,
        address recipient
    ) internal {
        (uint256 usdtReceived) = _withdrawInternalAave(
            amountUsdt,
            recipient
        );

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
            usdtReceived = IPool(AAVE).withdraw(USDT, amountUsdt, recipient);
        }

        if (amountUsdt != usdtReceived) {
            revert AaveHandlerAaveWithrawFailed();
        }

        emit AaveWithdraw(usdtReceived);

        return (usdtReceived);
    }
}
