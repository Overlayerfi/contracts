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
import "../token/types/MintRedeemManagerTypes.sol";

/**
 * @title AaveHandler
 * @notice This contract represent the Aave position handler
 */
abstract contract AaveHandler is
    Ownable2Step,
    IAaveHandlerDefs,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    //########################################## CONSTANT ##########################################

    ///@notice AAVE protocl Pool.sol contract address
    address public constant AAVE = 0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    ///@notice USDC eth mainnet contract address
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    ///@notice USDT eth mainnet contract address
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    ///@notice aUSDC eth mainnet contract address
    address public constant AUSDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;
    ///@notice aUSDT eth mainnet contract address
    address public constant AUSDT = 0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a;
    ///@notice AAVE referral code
    uint16 private constant AAVE_REFERRAL_CODE = 0;
    ///@notice team reward allocation percentage
    uint8 private constant TEAM_ALLOCATION = 20;
    ///@notice usdo reward allocation percentage
    uint8 private constant USDO_MINT_AMOUNT = 80;

    //########################################## IMMUTABLE ##########################################

    ///@notice USDO contract address
    address public immutable USDO;
    ///@notice sUSDO contract address
    address public immutable sUSDO;

    //########################################## PUBLIC STORAGE ##########################################

    ///@notice Amount of total supplied USDC
    uint256 public totalSuppliedUSDC;
    ///@notice Amount of total supplied USDT
    uint256 public totalSuppliedUSDT;

    //########################################## MODIFIERS ##########################################

    modifier onlyProtocol() {
        if (msg.sender != USDO) {
            revert AaveHandlerOperationNotAllowed();
        }
        _;
    }

    ///@notice The constructor
    ///@param admin The contract admin
    ///@param usdo The USDO contract
    ///@param usdo The sUSDO contract
    constructor(address admin, address usdo, address susdo) Ownable(admin) {
        if (admin == address(0)) revert AaveHandlerZeroAddressException();
        if (usdo == address(0)) revert AaveHandlerZeroAddressException();
        if (susdo == address(0)) revert AaveHandlerZeroAddressException();
        if (usdo == susdo) revert AaveHandlerSameAddressException();
        USDO = usdo;
        sUSDO = susdo;

        //approve AAVE
        approveAave(type(uint256).max);

        //approve USDO staking contract
        approveStakingUSDO(type(uint256).max);

        //approve USDO contract
        approveUSDO(type(uint256).max);
    }

    //########################################## PUBLIC FUNCTIONS ##########################################

    ///@notice Approve aave spending
    ///@param amount The amount to allow aave as spender
    function approveAave(uint256 amount) public onlyOwner {
        IERC20(USDC).forceApprove(AAVE, amount);
        IERC20(USDT).forceApprove(AAVE, amount);
    }

    ///@notice Approve Staked USDO spending
    ///@param amount The amount to allow sUSDO as spender
    function approveStakingUSDO(uint256 amount) public onlyOwner {
        IERC20(USDO).forceApprove(sUSDO, amount);
    }

    ///@notice Approve USDO spending
    ///@param amount The amount to allow USDO as spender
    function approveUSDO(uint256 amount) public onlyOwner {
        IERC20(USDC).forceApprove(USDO, amount);
        IERC20(USDT).forceApprove(USDO, amount);
    }

    ///@notice Withraw funds to AAVE protocol, the public interface for allowed callers
    ///@param amountUsdc The amount to withdraw intended as USDC
    ///@param amountUsdt The amount to withdraw intended as USDCT
    function withdraw(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) public onlyProtocol nonReentrant {
        withdrawInternal(amountUsdc, amountUsdt, msg.sender);
    }

    ///@notice Compound funds from-to AAVE protocol
    ///@dev This method assumes that USDC and USDT decimals are less or equal 18
    function compound() external nonReentrant {
        uint256 diffUSDC = IERC20(AUSDC).balanceOf(address(this)) -
            totalSuppliedUSDC;
        uint256 diffUSDT = IERC20(AUSDT).balanceOf(address(this)) -
            totalSuppliedUSDT;
        if (diffUSDC == 0 || diffUSDT == 0) {
            return;
        }
        //hardcoded USDC and USDT decimals offset as immutables, these multipliers represent the amount up to 18 decimlas
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

        IERC20(USDO).safeTransfer(owner(), minAmountBetween - amountToStaking);
    }

    ///@notice Renounce contract ownership
    ///@dev Reverts by design
    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    //########################################## EXTERNAL FUNCTIONS ##########################################

    ///@notice Supply funds to AAVE protocol
    ///@param amountUsdc The amount to supply intended as USDC
    ///@param amountUsdt The amount to supply intended as USDT
    function supply(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) external onlyProtocol nonReentrant {
        if (amountUsdc > 0) {
            IERC20(USDC).safeTransferFrom(USDO, address(this), amountUsdc);
            try
                IPool(AAVE).supply(
                    USDC,
                    amountUsdc,
                    address(this),
                    AAVE_REFERRAL_CODE
                )
            {} catch (bytes memory err) {
                emit AaveActionFailed("Supply USDC", err);
            }
        }
        if (amountUsdt > 0) {
            IERC20(USDT).safeTransferFrom(USDO, address(this), amountUsdt);
            try
                IPool(AAVE).supply(
                    USDT,
                    amountUsdt,
                    address(this),
                    AAVE_REFERRAL_CODE
                )
            {} catch (bytes memory err) {
                emit AaveActionFailed("Supply USDT", err);
            }
        }
        unchecked {
            totalSuppliedUSDC += amountUsdc;
            totalSuppliedUSDT += amountUsdt;
        }

        emit AaveSupply(amountUsdc, amountUsdt);
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
        if (amountUsdc > 0) {
            try IPool(AAVE).withdraw(USDC, amountUsdc, recipient) {} catch (
                bytes memory err
            ) {
                emit AaveActionFailed("Withdraw USDC", err);
            }
        }
        if (amountUsdt > 0) {
            try IPool(AAVE).withdraw(USDT, amountUsdt, recipient) {} catch (
                bytes memory err
            ) {
                emit AaveActionFailed("Withdraw USDT", err);
            }
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
