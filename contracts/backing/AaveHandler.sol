// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IAaveHandlerDefs} from "./interfaces/IAaveHandlerDefs.sol";
import {IsUSDO} from "./interfaces/IsUSDO.sol";
import {IUSDO} from "./interfaces/IUSDO.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Constants} from "./Constants.sol";
import {PositionSwapper} from "./PositionSwapper.sol";
import {PositionSwapperParams} from "./PositionSwapperParams.sol";
import "../token/types/MintRedeemManagerTypes.sol";

/**
 * @title AaveHandler
 * @notice This contract represent the Aave position handler
 */
abstract contract AaveHandler is
    Constants,
    PositionSwapper,
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

    //########################################## IMMUTABLE ##########################################

    ///@notice USDO contract address
    address public immutable USDO;
    ///@notice sUSDO contract address
    address public immutable sUSDO;

    //########################################## PUBLIC STORAGE ##########################################

    ///@notice AAVE protocl Pool.sol contract address
    address public AAVE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    ///@notice Protocol treasury
    address public TREASURY;
    ///@notice Amount of total supplied USDC
    uint256 public totalSuppliedUSDC;
    ///@notice Amount of total supplied USDT
    uint256 public totalSuppliedUSDT;
    /// @notice the proposed new spender
    address public proposedAave;
    /// @notice the last aave proposal time
    uint256 public aaveProposalTime;
    /// @notice the last team allocation proposal time
    uint256 public teamAllocationProposalTime;
    /// @notice the proposed team allocation percentage
    uint8 public proposedTeamAllocation;

    //########################################## PRIVATE STORAGE ##########################################

    ///@notice team reward allocation percentage
    uint8 private TEAM_ALLOCATION = 20;
    ///@notice usdo reward allocation percentage
    uint8 private USDO_MINT_AMOUNT = 80;

    //########################################## MODIFIERS ##########################################

    modifier onlyProtocol() {
        if (msg.sender != USDO) {
            revert AaveHandlerOperationNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param treasury The protocol treasury
    ///@param usdo The USDO contract
    ///@param usdo The sUSDO contract
    constructor(
        address admin,
        address treasury,
        address usdo,
        address susdo
    ) Ownable(admin) {
        if (admin == address(0)) revert AaveHandlerZeroAddressException();
        if (treasury == address(0)) revert AaveHandlerZeroAddressException();
        if (usdo == address(0)) revert AaveHandlerZeroAddressException();
        if (susdo == address(0)) revert AaveHandlerZeroAddressException();
        if (usdo == susdo) revert AaveHandlerSameAddressException();
        TREASURY = treasury;
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

    ///@notice Withraw funds from AAVE protocol
    ///@dev Use with caution, it will forward all the user funds to the protocol token (funds are safu)
    ///@dev It requires equal amounts in input
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDCT
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

        totalSuppliedUSDC -= usdcBack;
        totalSuppliedUSDT -= usdtBack;

        //the amount to inject back to the protocol is represented by total totalSuppliedUSDC/T
        IERC20(USDC).safeTransfer(USDO, usdcBack);
        IERC20(USDT).safeTransfer(USDO, usdtBack);
        if (amountUsdc > oldUsdcSupplied) {
            uint256 usdcDiff = amountUsdc - oldUsdcSupplied;
            if (usdcDiff > 0) {
                IERC20(USDC).safeTransfer(owner(), usdcDiff);
            }
        }
        if (amountUsdt > oldUsdtSupplied) {
            uint256 usdtDiff = amountUsdt - oldUsdtSupplied;
            if (usdtDiff > 0) {
                IERC20(USDT).safeTransfer(owner(), usdtDiff);
            }
        }
    }

    ///@notice Compound funds from-to AAVE protocol
    ///@dev This method assumes that USDC and USDT decimals are less or equal 18
    ///@dev We track the user deposited funds with totalSuppliedUSDC/T and leverage
    ///the dynamic balance of AAVE aToken in order to compute the gains
    function compound() external nonReentrant {
        uint256 diffUSDC = IERC20(AUSDC).balanceOf(address(this)) -
            totalSuppliedUSDC;
        uint256 diffUSDT = IERC20(AUSDT).balanceOf(address(this)) -
            totalSuppliedUSDT;
        if (diffUSDC == 0 || diffUSDT == 0) {
            return;
        }
        //hardcoded USDC and USDT decimals offset as immutables,
        //these multipliers represent the amount up to 18 decimals (usdo decimals)
        uint256 usdcMultiplier = 10 ** 12;
        uint256 usdtMultiplier = 10 ** 12;
        uint256 minAmountBetween = Math.min(
            diffUSDC * usdcMultiplier,
            diffUSDT * usdtMultiplier
        );
        uint256 usdcWithdrawAmount = minAmountBetween / usdcMultiplier;
        uint256 usdtWithdrawAmount = minAmountBetween / usdtMultiplier;

        withdrawInternal(usdcWithdrawAmount, usdtWithdrawAmount, address(this));

        MintRedeemManagerTypes.Order memory order = MintRedeemManagerTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral_usdt: address(USDT),
                collateral_usdc: address(USDC),
                collateral_usdt_amount: usdtWithdrawAmount,
                collateral_usdc_amount: usdcWithdrawAmount,
                usdo_amount: minAmountBetween * 2
            });
        IUSDO(USDO).mint(order);

        uint256 amountToStaking = minAmountBetween.mulDiv(
            USDO_MINT_AMOUNT,
            100
        );
        IsUSDO(sUSDO).transferInRewards(amountToStaking);

        IERC20(USDO).safeTransfer(TREASURY, minAmountBetween - amountToStaking);
    }

    ///@notice Supply funds to AAVE protocol
    ///@param amountUsdc The amount to supply intended as USDC
    ///@param amountUsdt The amount to supply intended as USDT
    function supply(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) external onlyProtocol nonReentrant {
        if (amountUsdc > 0) {
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
        if (amountUsdt > 0) {
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
        unchecked {
            totalSuppliedUSDC += amountUsdc;
            totalSuppliedUSDT += amountUsdt;
        }

        emit AaveSupply(amountUsdc, amountUsdt);
    }

    ///@notice Propose a new AAVE contract
    ///@dev Can not be zero address
    ///@param aave The new AAVE address
    function proposeNewAave(address aave) external onlyOwner nonReentrant {
        if (aave == address(0)) revert AaveHandlerZeroAddressException();
        proposedAave = aave;
        aaveProposalTime = block.timestamp;
    }

    ///@notice Propose a new AAVE contract
    ///@dev Can not be zero address
    ///@param _proposedTeamAllocation The new proposed team allocation
    function proposeNewTeamAllocation(
        uint8 _proposedTeamAllocation
    ) external onlyOwner {
        if (_proposedTeamAllocation > 100)
            revert AaveHandlerOperationNotAllowed();
        proposedTeamAllocation = _proposedTeamAllocation;
        teamAllocationProposalTime = block.timestamp;
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
        //remove allowance of old spender
        if (oldAave != address(0)) {
            IERC20(USDC).forceApprove(oldAave, 0);
            IERC20(USDT).forceApprove(oldAave, 0);
        }
        IERC20(USDC).forceApprove(AAVE, type(uint256).max);
        IERC20(USDT).forceApprove(AAVE, type(uint256).max);

        emit AaveNewAave(AAVE);
    }

    ///@notice Accept the proposed team allocation
    function acceptProposedTeamAllocation() external onlyOwner {
        if (
            teamAllocationProposalTime + PROPOSAL_TIME_INTERVAL >
            block.timestamp
        ) {
            revert AaveIntervalNotRespected();
        }
        TEAM_ALLOCATION = proposedTeamAllocation;
        USDO_MINT_AMOUNT = 100 - TEAM_ALLOCATION;

        emit AaveNewTeamAllocation(TEAM_ALLOCATION);
    }

    ///@notice Update protocol treasury
    ///@dev Does not harm protocol users
    ///@param treasury The new treasury address
    function updateTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert AaveHandlerZeroAddressException();
        TREASURY = treasury;
        emit AaveNewTreasury(treasury);
    }

    ///@notice Swap the current stable coins position into a blue chip (WETH)
    function adminSwapPosition() external onlyOwner {
        uint256 amountUsdc = IERC20(AUSDC).balanceOf(address(this));
        uint256 amountUsdt = IERC20(AUSDT).balanceOf(address(this));
        PositionSwapperParams memory params = PositionSwapperParams(
            USDC,
            AUSDC,
            USDT,
            AUSDT,
            WETH,
            AAVE,
            UNI_SWAP_ROUTER_V2,
            UNI_QUOTER_V2,
            amountUsdc,
            amountUsdt,
            address(this),
            AAVE_REFERRAL_CODE
        );
        uint256 swapped = swap(params);
        emit AaveSwapPosition(amountUsdc, amountUsdt, swapped);
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
    }

    ///@notice Withraw funds from AAVE protocol, the public interface for allowed callers
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDCT
    function withdraw(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) public onlyProtocol nonReentrant {
        withdrawInternal(amountUsdc, amountUsdt, msg.sender);
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    //########################################## INTERNAL FUNCTIONS ##########################################

    ///@notice Withraw funds to AAVE protocol
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDCT
    ///@param recipient The collateral recipient
    function withdrawInternal(
        uint256 amountUsdc,
        uint256 amountUsdt,
        address recipient
    ) internal {
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

        if (amountUsdc > totalSuppliedUSDC) {
            totalSuppliedUSDC = 0;
        } else {
            unchecked {
                totalSuppliedUSDC -= amountUsdc;
            }
        }
        if (amountUsdt > totalSuppliedUSDT) {
            totalSuppliedUSDT = 0;
        } else {
            unchecked {
                totalSuppliedUSDT -= amountUsdt;
            }
        }

        emit AaveWithdraw(amountUsdc, amountUsdt);
    }
}
