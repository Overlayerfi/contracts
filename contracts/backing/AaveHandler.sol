// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IAaveHandlerDefs} from "./interfaces/IAaveHandlerDefs.sol";
import {IDispatcher} from "./interfaces/IDispatcher.sol";
import {IsUSDO} from "./interfaces/IsUSDO.sol";
import {IUSDO} from "./interfaces/IUSDO.sol";
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
    /// @notice decimals offset between usdo and usdc/usdt
    uint256 public constant DECIMALS_DIFF_AMOUNT = 10 ** 12;

    //########################################## IMMUTABLE ##########################################

    ///@notice USDO contract address
    address public immutable USDO;
    ///@notice sUSDO contract address
    address public immutable sUSDO;

    //########################################## PUBLIC STORAGE ##########################################

    ///@notice AAVE protocl Pool.sol contract address
    address public AAVE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    ///@notice Protocol rewardsDispatcher
    address public OVA_REWARDS_DISPATCHER;
    ///@notice Amount of total supplied USDC
    uint256 public totalSuppliedUSDC;
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
    ///@notice usdo reward allocation percentage
    uint8 public stakedUsdoRewardsAllocation = 80;

    //########################################## MODIFIERS ##########################################

    modifier onlyProtocol() {
        if (msg.sender != USDO) {
            revert AaveHandlerCallerIsNotUsdo();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param rewardsDispatcher The protocol rewardsDispatcher contract
    ///@param usdo The USDO contract
    ///@param usdo The sUSDO contract
    constructor(
        address admin,
        address rewardsDispatcher,
        address usdo,
        address susdo
    ) Ownable(admin) {
        if (admin == address(0)) revert AaveHandlerZeroAddressException();
        if (rewardsDispatcher == address(0))
            revert AaveHandlerZeroAddressException();
        if (usdo == address(0)) revert AaveHandlerZeroAddressException();
        if (susdo == address(0)) revert AaveHandlerZeroAddressException();
        if (usdo == susdo) revert AaveHandlerSameAddressException();
        OVA_REWARDS_DISPATCHER = rewardsDispatcher;
        USDO = usdo;
        sUSDO = susdo;

        //approve AAVE
        approveAave(type(uint256).max);

        //approve USDO staking contract
        approveStakingUSDO(type(uint256).max);

        //approve USDO contract
        approveUSDO(type(uint256).max);
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Withraw funds from aave and return all the collateral to USDO
    ///@dev It requires equal amounts in input
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDT
    function adminWithdraw(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) external onlyOwner nonReentrant {
        if (IERC20(AUSDC).balanceOf(address(this)) < amountUsdc)
            revert AaveHandlerInsufficientBalance();
        if (IERC20(AUSDT).balanceOf(address(this)) < amountUsdt)
            revert AaveHandlerInsufficientBalance();
        uint256 usdcReceived = 0;
        uint256 usdtReceived = 0;
        if (amountUsdc > 0) {
            usdcReceived = IPool(AAVE).withdraw(
                USDC,
                amountUsdc,
                address(this)
            );
        }
        if (amountUsdt > 0) {
            usdtReceived = IPool(AAVE).withdraw(
                USDT,
                amountUsdt,
                address(this)
            );
        }
        if ((amountUsdc != usdcReceived) || (amountUsdt != usdtReceived)) {
            revert AaveHandlerAaveWithrawFailed();
        }

        uint256 oldUsdcSupplied = totalSuppliedUSDC;
        uint256 oldUsdtSupplied = totalSuppliedUSDT;

        //amount to inject back to protocol
        uint256 usdcBack = amountUsdc < totalSuppliedUSDC
            ? amountUsdc
            : totalSuppliedUSDC;
        uint256 usdtBack = amountUsdt < totalSuppliedUSDT
            ? amountUsdt
            : totalSuppliedUSDT;

        // Compute the updated supplied amount
        totalSuppliedUSDC -= usdcBack;
        totalSuppliedUSDT -= usdtBack;
        // Return collateral to protocol token
        IERC20(USDC).safeTransfer(USDO, usdcBack);
        IERC20(USDT).safeTransfer(USDO, usdtBack);

        if (amountUsdc > oldUsdcSupplied) {
            uint256 usdcDiff = amountUsdc - oldUsdcSupplied;
            if (usdcDiff > 0) {
                IERC20(USDC).safeTransfer(OVA_REWARDS_DISPATCHER, usdcDiff);
            }
        }
        if (amountUsdt > oldUsdtSupplied) {
            uint256 usdtDiff = amountUsdt - oldUsdtSupplied;
            if (usdtDiff > 0) {
                IERC20(USDT).safeTransfer(OVA_REWARDS_DISPATCHER, usdtDiff);
            }
        }
    }

    ///@notice Compound funds from-to AAVE protocol
    function compound() external nonReentrant {
        bool isEmergencyMode = IUSDO(USDO).emergencyMode();

        uint256 diffUSDC = IERC20(AUSDC).balanceOf(address(this)) -
            totalSuppliedUSDC;
        uint256 diffUSDT = IERC20(AUSDT).balanceOf(address(this)) -
            totalSuppliedUSDT;
        if (diffUSDC == 0 || diffUSDT == 0) {
            return;
        }
        // Decimals difference are harcoded as they don't mutate
        uint256 minAmountBetween = Math.min(
            diffUSDC * DECIMALS_DIFF_AMOUNT,
            diffUSDT * DECIMALS_DIFF_AMOUNT
        );
        uint256 usdcWithdrawAmount = minAmountBetween / DECIMALS_DIFF_AMOUNT;
        uint256 usdtWithdrawAmount = minAmountBetween / DECIMALS_DIFF_AMOUNT;

        if (!isEmergencyMode) {
            _withdrawInternalAave(
                usdcWithdrawAmount,
                usdtWithdrawAmount,
                address(this)
            );
        }
        // Otherwise we use aTokens directly

        MintRedeemManagerTypes.Order memory order = MintRedeemManagerTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral_usdt: isEmergencyMode ? AUSDT : USDT,
                collateral_usdc: isEmergencyMode ? AUSDC : USDC,
                collateral_usdt_amount: usdtWithdrawAmount,
                collateral_usdc_amount: usdcWithdrawAmount,
                usdo_amount: minAmountBetween * 2
            });
        IUSDO(USDO).mint(order);

        uint256 amountToStaking = minAmountBetween.mulDiv(
            stakedUsdoRewardsAllocation,
            100
        );
        IsUSDO(sUSDO).transferInRewards(amountToStaking);

        IERC20(USDO).safeTransfer(
            OVA_REWARDS_DISPATCHER,
            minAmountBetween - amountToStaking
        );
        IDispatcher(OVA_REWARDS_DISPATCHER).dispatch();
    }

    ///@notice Supply funds to AAVE protocol
    ///@param amountUsdc The amount to supply intended as USDC or their aToken version
    ///@param amountUsdt The amount to supply intended as USDT or their aToken version
    function supply(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) external onlyProtocol nonReentrant {
        bool isEmergencyMode = IUSDO(USDO).emergencyMode();
        if (amountUsdc > 0) {
            if (isEmergencyMode) {
                IERC20(AUSDC).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdc
                );
            } else {
                IERC20(USDC).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdc
                );
                IPool(AAVE).supply(
                    USDC,
                    amountUsdc,
                    address(this),
                    AAVE_REFERRAL_CODE
                );
            }
        }
        if (amountUsdt > 0) {
            if (isEmergencyMode) {
                IERC20(AUSDT).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountUsdc
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
        // We cannot exceed the USDO supply.
        uint256 halfSupply = (IUSDO(USDO).totalSupply() / 2) /
            DECIMALS_DIFF_AMOUNT;
        uint256 differenceUsdc = halfSupply - totalSuppliedUSDC;
        uint256 differenceUsdt = halfSupply - totalSuppliedUSDT;
        if (differenceUsdc > amountUsdc) {
            revert AaveHandlerUnexpectedAmount();
        }
        if (differenceUsdt > amountUsdt) {
            revert AaveHandlerUnexpectedAmount();
        }
        totalSuppliedUSDC += Math.min(amountUsdc, differenceUsdc);
        totalSuppliedUSDT += Math.min(amountUsdt, differenceUsdt);

        emit AaveSupply(amountUsdc, amountUsdt);
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
            IERC20(USDC).forceApprove(oldAave, 0);
            IERC20(USDT).forceApprove(oldAave, 0);
        }
        IERC20(USDC).forceApprove(AAVE, type(uint256).max);
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
        stakedUsdoRewardsAllocation = 100 - ovaDispatcherAllocation;

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
        IERC20(USDC).forceApprove(AAVE, amount);
        IERC20(USDT).forceApprove(AAVE, amount);
    }

    ///@notice Approve Staked USDO spending
    ///@param amount The amount to allow sUSDO as spender
    function approveStakingUSDO(uint256 amount) public onlyOwner nonReentrant {
        IERC20(USDO).forceApprove(sUSDO, amount);
    }

    ///@notice Approve USDO spending
    ///@param amount The amount to allow USDO as spender
    function approveUSDO(uint256 amount) public onlyOwner nonReentrant {
        IERC20(USDC).forceApprove(USDO, amount);
        IERC20(USDT).forceApprove(USDO, amount);
        IERC20(AUSDC).forceApprove(USDO, amount);
        IERC20(AUSDT).forceApprove(USDO, amount);
    }

    ///@notice Withraw funds from aave protocol
    ///@param amountUsdc The amount to withdraw intended as USDC or their aToken version
    ///@param amountUsdt The amount to withdraw intended as USDT or their aToken version
    function withdraw(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) public onlyProtocol nonReentrant {
        bool isEmergencyMode = IUSDO(USDO).emergencyMode();
        if (!isEmergencyMode) {
            _withdrawInternal(amountUsdc, amountUsdt, msg.sender);
        } else {
            _withdrawInternalEmergency(amountUsdc, amountUsdt, msg.sender);
        }
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    //########################################## INTERNAL FUNCTIONS ##########################################

    /// @notice Update the supplied usdc and usdt counter
    /// @param usdcTaken The amount of usdc removed from the backing supply
    /// @param usdtTaken The amount of usdt removed from the backing supply
    function updateSuppliedAmounts(
        uint256 usdcTaken,
        uint256 usdtTaken
    ) internal {
        if (usdcTaken > totalSuppliedUSDC) {
            totalSuppliedUSDC = 0;
        } else {
            unchecked {
                totalSuppliedUSDC -= usdcTaken;
            }
        }
        if (usdtTaken > totalSuppliedUSDT) {
            totalSuppliedUSDT = 0;
        } else {
            unchecked {
                totalSuppliedUSDT -= usdtTaken;
            }
        }
    }

    ///@notice Withraw funds taking aTokens directly
    ///@param amountUsdc The amount to withdraw intended as aUSDC
    ///@param amountUsdt The amount to withdraw intended as aUSDT
    ///@param recipient The collateral recipient
    function _withdrawInternalEmergency(
        uint256 amountUsdc,
        uint256 amountUsdt,
        address recipient
    ) internal {
        uint256 aUsdcBal = IERC20(AUSDC).balanceOf(address(this));
        uint256 aUsdtBal = IERC20(AUSDT).balanceOf(address(this));
        if (aUsdcBal < amountUsdc || aUsdtBal < amountUsdt) {
            revert AaveHandlerInsufficientABalance();
        }
        IERC20(AUSDC).safeTransfer(recipient, amountUsdc);
        IERC20(AUSDT).safeTransfer(recipient, amountUsdt);

        updateSuppliedAmounts(amountUsdc, amountUsdt);
    }

    ///@notice Withraw funds from aave and update supply counters
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDT
    ///@param recipient The collateral recipient
    function _withdrawInternal(
        uint256 amountUsdc,
        uint256 amountUsdt,
        address recipient
    ) internal {
        (uint256 usdcReceived, uint256 usdtReceived) = _withdrawInternalAave(
            amountUsdc,
            amountUsdt,
            recipient
        );

        updateSuppliedAmounts(usdcReceived, usdtReceived);
    }

    ///@notice Withraw funds to aave
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDT
    ///@param recipient The collateral recipient
    function _withdrawInternalAave(
        uint256 amountUsdc,
        uint256 amountUsdt,
        address recipient
    ) internal returns (uint256, uint256) {
        if (IERC20(AUSDC).balanceOf(address(this)) < amountUsdc)
            revert AaveHandlerInsufficientBalance();
        if (IERC20(AUSDT).balanceOf(address(this)) < amountUsdt)
            revert AaveHandlerInsufficientBalance();
        uint256 usdcReceived = 0;
        uint256 usdtReceived = 0;
        if (amountUsdc > 0) {
            usdcReceived = IPool(AAVE).withdraw(USDC, amountUsdc, recipient);
        }
        if (amountUsdt > 0) {
            usdtReceived = IPool(AAVE).withdraw(USDT, amountUsdt, recipient);
        }

        if ((amountUsdc != usdcReceived) || (amountUsdt != usdtReceived)) {
            revert AaveHandlerAaveWithrawFailed();
        }

        emit AaveWithdraw(usdcReceived, usdtReceived);

        return (usdcReceived, usdtReceived);
    }
}
