// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IAaveHandlerDefs} from "./interfaces/IAaveHandlerDefs.sol";
import {IDispatcher} from "./interfaces/IDispatcher.sol";
import {IsOverlayerWrap} from "./interfaces/IsOverlayerWrap.sol";
import {IOverlayerWrap} from "./interfaces/IOverlayerWrap.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../overlayer/types/OverlayerWrapCoreTypes.sol";

/**
 * @title GhoSghoHandler
 * @notice Backing handler for GHO deposited into an ERC-4626 sGHO-style vault (yield), instead of Aave supply.
 * @dev `collateral` is GHO; `aCollateral` is the vault share token (same address as IERC4626). On Aave V3, GHO is a
 *      multi-facilitator stablecoin; liquidity and yield for “savings” GHO are provided via the sGHO vault, not a lend
 *      market position analogous to USDC → aUSDC.
 * @dev Incoming GHO is only deposited into sGHO once idle GHO reaches `liquidReserveTarget`; any excess is always
 *      deployed. User withdrawals redeem from sGHO first and spend idle GHO only for the amount the vault cannot pay.
 */
/// @dev Local errors/events so GhoSghoHandler matches hp-branch AaveHandler fixes without changing IAaveHandlerDefs.
interface GhoSghoHandlerLocalDefs {
    error GhoSghoHandlerNoProposal();

    event OvaDispatcherAllocationUpdated(uint8 amount);
    event GhoSghoLiquidReserveTargetUpdated(uint256 amount);
    /// @notice Emitted when `compound` skips harvesting because the required amount cannot be withdrawn from sGHO.
    /// @param harvestable Total yield that would have been harvested.
    /// @param neededFromVault Amount that needed to come from sGHO.
    /// @param vaultWithdrawable Amount sGHO could pay.
    event GhoSghoHarvestDeferred(
        uint256 harvestable,
        uint256 neededFromVault,
        uint256 vaultWithdrawable
    );
    /// @notice Emitted when `adminWithdraw` returns less than the tracked principal.
    /// @param withdrawn Amount returned to OverlayerWrap.
    /// @param remaining Principal still tracked in `totalSuppliedCollateral`.
    event GhoSghoAdminWithdrawPartial(uint256 withdrawn, uint256 remaining);
}

abstract contract GhoSghoHandler is
    Ownable2Step,
    IAaveHandlerDefs,
    GhoSghoHandlerLocalDefs,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant PROPOSAL_TIME_INTERVAL = 10 days;

    address public immutable overlayerWrap;
    address public immutable sOverlayerWrap;
    address public immutable collateral;
    address public immutable aCollateral;
    uint256 public immutable DECIMALS_DIFF_AMOUNT;

    address public ovaRewardsDispatcher;
    uint256 public totalSuppliedCollateral;
    uint256 public ovaDispatcherAllocationProposalTime;
    uint8 public proposedOvaDispatcherAllocation;

    uint8 public ovaDispatcherAllocation = 20;
    uint8 public stakedOverlayerWrapRewardsAllocation = 80;
    /// @notice Idle GHO to keep on this contract instead of depositing into sGHO (0 = deploy all).
    uint256 public liquidReserveTarget;

    modifier onlyProtocol() {
        if (msg.sender != overlayerWrap) {
            revert AaveHandlerCallerIsNotOverlayerWrap();
        }
        _;
    }

    constructor(
        address admin_,
        address rewardsDispatcher_,
        address overlayerWrap_,
        address sOverlayerWrap_,
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
        if (collateral_ == address(0)) revert AaveHandlerZeroAddressException();
        if (aCollateral_ == address(0))
            revert AaveHandlerZeroAddressException();
        if (overlayerWrap_ == sOverlayerWrap_)
            revert AaveHandlerSameAddressException();
        if (IERC4626(aCollateral_).asset() != collateral_)
            revert AaveHandlerInvalidCollateral();

        ovaRewardsDispatcher = rewardsDispatcher_;
        overlayerWrap = overlayerWrap_;
        sOverlayerWrap = sOverlayerWrap_;
        collateral = collateral_;
        aCollateral = aCollateral_;

        uint8 overlayerWrapDecimals = IERC20Metadata(overlayerWrap_).decimals();
        uint8 collateralDecimals = IERC20Metadata(collateral_).decimals();
        if (overlayerWrapDecimals < collateralDecimals) {
            revert AaveHandlerInvalidDecimals();
        }
        DECIMALS_DIFF_AMOUNT =
            10 ** (overlayerWrapDecimals - collateralDecimals);

        IERC20(collateral).forceApprove(aCollateral, type(uint256).max);
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, type(uint256).max);
        IERC20(collateral).forceApprove(overlayerWrap, type(uint256).max);
        IERC20(aCollateral).forceApprove(overlayerWrap, type(uint256).max);
    }

    /// @notice Withdraw tracked principal as GHO to OverlayerWrap. Surplus shares (yield) go to the dispatcher.
    /// @dev Withdraws idle GHO first, then up to `_vaultWithdrawable()` from sGHO. Any unpaid principal remains
    ///      in `totalSuppliedCollateral` and can be withdrawn in a later call. Surplus sGHO shares are transferred
    ///      to the dispatcher only when the full principal has been withdrawn.
    function adminWithdraw() external onlyOwner nonReentrant {
        uint256 principal = totalSuppliedCollateral;
        uint256 liquid = IERC20(collateral).balanceOf(address(this));
        uint256 fromReserve = Math.min(principal, liquid);
        // `_withdrawFromVault` already clamps to `min(requested, _vaultWithdrawable())`.
        uint256 fromVault = _withdrawFromVault(
            principal - fromReserve,
            overlayerWrap
        );

        if (fromReserve > 0) {
            IERC20(collateral).safeTransfer(overlayerWrap, fromReserve);
        }

        uint256 withdrawn = fromReserve + fromVault;
        if (withdrawn == principal) {
            // Surplus is yield only: full principal withdrawal leaves no tracked backing on this contract.
            uint256 surplusShares = IERC20(aCollateral).balanceOf(
                address(this)
            );
            if (surplusShares > 0) {
                IERC20(aCollateral).safeTransfer(
                    ovaRewardsDispatcher,
                    surplusShares
                );
            }
        } else {
            emit GhoSghoAdminWithdrawPartial(withdrawn, principal - withdrawn);
        }

        updateSuppliedAmounts(withdrawn);
        emit AaveAdminWithdraw(withdrawn);
    }

    /// @param withdrawToCollateral_ Ignored (interface parity with AaveHandler). Yield is always withdrawn as GHO
    ///        before minting OverlayerWrap; see contract comment on sGHO vs aToken accounting.
    /// @dev Harvestable yield is `idle GHO + sGHO assets - totalSuppliedCollateral`. Idle principal is not yield,
    ///      including GHO left above `liquidReserveTarget` before it is deployed. The reserve kept on this contract
    ///      is `min(liquidReserveTarget, totalSuppliedCollateral)`.
    /// @dev If the sGHO portion of that yield cannot be withdrawn, returns without minting and emits
    ///      `GhoSghoHarvestDeferred`. The yield remains in the backing until a later successful `compound`.
    function compound(bool withdrawToCollateral_) external nonReentrant {
        withdrawToCollateral_;
        uint256 liquid = IERC20(collateral).balanceOf(address(this));
        uint256 sharesBal = IERC20(aCollateral).balanceOf(address(this));
        uint256 vaultAssets = IERC4626(aCollateral).convertToAssets(sharesBal);

        uint256 principal = totalSuppliedCollateral;
        uint256 totalBacking = liquid + vaultAssets;
        if (totalBacking <= principal) return;
        uint256 harvestable = totalBacking - principal;

        uint256 idleFloor = Math.min(liquidReserveTarget, principal);
        uint256 excessIdle = liquid > idleFloor ? liquid - idleFloor : 0;
        uint256 fromIdle = Math.min(harvestable, excessIdle);
        uint256 needFromVault = harvestable - fromIdle;

        uint256 fromVault = 0;
        if (needFromVault > 0) {
            uint256 withdrawable = _vaultWithdrawable();
            if (withdrawable < needFromVault) {
                emit GhoSghoHarvestDeferred(
                    harvestable,
                    needFromVault,
                    withdrawable
                );
                return;
            }
            fromVault = _withdrawFromVault(needFromVault, address(this));
            if (fromVault < needFromVault) {
                emit GhoSghoHarvestDeferred(
                    harvestable,
                    needFromVault,
                    fromVault
                );
                return;
            }
        }

        uint256 toCompound = fromIdle + fromVault;
        if (toCompound == 0) return;

        uint256 scaledDiff = toCompound.mulDiv(DECIMALS_DIFF_AMOUNT, 1);

        OverlayerWrapCoreTypes.Order memory order = OverlayerWrapCoreTypes
            .Order({
                benefactor: address(this),
                beneficiary: address(this),
                collateral: collateral,
                collateralAmount: toCompound,
                overlayerWrapAmount: scaledDiff
            });
        IOverlayerWrap(overlayerWrap).mint(order);

        uint256 amountToStaking = scaledDiff.mulDiv(
            stakedOverlayerWrapRewardsAllocation,
            100
        );
        // transferInRewards will revert on 0 amounts
        if (amountToStaking > 0) {
            IsOverlayerWrap(sOverlayerWrap).transferInRewards(amountToStaking);
        }

        IERC20(overlayerWrap).safeTransfer(
            ovaRewardsDispatcher,
            scaledDiff - amountToStaking
        );
        IDispatcher(ovaRewardsDispatcher).dispatch();
    }

    function supply(
        uint256 amountCollateral_,
        address collateralToken_
    ) external onlyProtocol nonReentrant {
        // `supplyToBacking(0, 0)` forwards the whole sGHO balance. Taking or reverting on it would
        // roll back the GHO deposit in the same transaction, so donated sGHO stays on OverlayerWrap.
        if (collateralToken_ == aCollateral) return;

        uint256 amountAssetsForAccounting = 0;
        if (amountCollateral_ > 0) {
            if (collateralToken_ == collateral) {
                IERC20(collateral).safeTransferFrom(
                    msg.sender,
                    address(this),
                    amountCollateral_
                );
                amountAssetsForAccounting = amountCollateral_;
            } else {
                revert AaveHandlerInvalidCollateral();
            }
        }

        uint256 owTotalSupp = IOverlayerWrap(overlayerWrap).totalSupply() +
            IOverlayerWrap(overlayerWrap).totalBridgedOut();
        if (owTotalSupp < DECIMALS_DIFF_AMOUNT)
            revert AaveHandlerOverlayerWrapTotalSupplyTooLow();
        uint256 normalizedSupply = owTotalSupp / DECIMALS_DIFF_AMOUNT;
        // Local-only redemptions can burn OW without withdraw(), so this counter may
        // exceed normalized supply; for example if donations are made to OW.
        uint256 differenceCollateral = normalizedSupply >
            totalSuppliedCollateral
            ? normalizedSupply - totalSuppliedCollateral
            : 0;
        uint256 minIncrease = Math.min(
            amountAssetsForAccounting,
            differenceCollateral
        );
        totalSuppliedCollateral += minIncrease;

        _deployExcessAboveReserve();

        emit AaveSupply(minIncrease);
    }

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

    function acceptProposedOvaDispatcherAllocation() external onlyOwner {
        if (ovaDispatcherAllocationProposalTime == 0)
            revert GhoSghoHandlerNoProposal();
        if (
            ovaDispatcherAllocationProposalTime + PROPOSAL_TIME_INTERVAL >
            block.timestamp
        ) {
            revert AaveIntervalNotRespected();
        }
        ovaDispatcherAllocation = proposedOvaDispatcherAllocation;
        stakedOverlayerWrapRewardsAllocation = 100 - ovaDispatcherAllocation;
        // Clear proposal state
        proposedOvaDispatcherAllocation = 0;
        ovaDispatcherAllocationProposalTime = 0;

        emit OvaDispatcherAllocationUpdated(ovaDispatcherAllocation);
    }

    function updateRewardsDispatcher(
        address rewardsDispatcher_
    ) external onlyOwner {
        if (rewardsDispatcher_ == address(0))
            revert AaveHandlerZeroAddressException();
        ovaRewardsDispatcher = rewardsDispatcher_;
        emit AaveNewRewardsDispatcher(rewardsDispatcher_);
    }

    function approveStakingOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(overlayerWrap).forceApprove(sOverlayerWrap, amount_);
        emit AaveStakingApprovalUpdated(sOverlayerWrap, amount_);
    }

    function approveOverlayerWrap(
        uint256 amount_
    ) public onlyOwner nonReentrant {
        IERC20(collateral).forceApprove(overlayerWrap, amount_);
        IERC20(aCollateral).forceApprove(overlayerWrap, amount_);
        emit AaveOverlayerWrapApprovalUpdated(amount_);
    }

    /// @notice Refresh max allowance for the sGHO vault to pull GHO (replaces Aave pool approval)
    function approveVault(uint256 amount_) public onlyOwner nonReentrant {
        IERC20(collateral).forceApprove(aCollateral, amount_);
        emit AaveApprovalUpdated(aCollateral, amount_);
    }

    /// @notice Set how much idle GHO to keep un-deposited into sGHO.
    function setLiquidReserveTarget(
        uint256 liquidReserveTarget_
    ) external onlyOwner {
        liquidReserveTarget = liquidReserveTarget_;
        emit GhoSghoLiquidReserveTargetUpdated(liquidReserveTarget_);
    }

    /// @notice Deposit idle GHO above `liquidReserveTarget` into sGHO, or pull from sGHO to refill the buffer.
    function rebalanceLiquidReserve() external onlyOwner nonReentrant {
        uint256 liquid = IERC20(collateral).balanceOf(address(this));
        if (liquid >= liquidReserveTarget) {
            _deployExcessAboveReserve();
            return;
        }
        uint256 pull = Math.min(
            liquidReserveTarget - liquid,
            _vaultWithdrawable()
        );
        if (pull > 0) {
            IERC4626(aCollateral).withdraw(pull, address(this), address(this));
        }
    }

    function withdraw(
        uint256 amountCollateral_,
        address collateralToken_
    ) public onlyProtocol nonReentrant {
        if (collateralToken_ == collateral) {
            _withdrawInternal(amountCollateral_, msg.sender);
        } else if (collateralToken_ == aCollateral) {
            revert AaveHandlerInvalidCollateral();
        } else {
            revert AaveHandlerInvalidCollateral();
        }
    }

    function renounceOwnership() public view override onlyOwner {
        revert AaveHandlerCantRenounceOwnership();
    }

    function updateSuppliedAmounts(uint256 collateralTaken_) internal {
        if (collateralTaken_ > totalSuppliedCollateral) {
            totalSuppliedCollateral = 0;
        } else {
            unchecked {
                totalSuppliedCollateral -= collateralTaken_;
            }
        }
    }

    /// @dev Pay from sGHO first. Idle GHO covers only the amount the vault cannot pay.
    function _withdrawInternal(
        uint256 amountCollateral_,
        address recipient_
    ) internal {
        if (amountCollateral_ == 0) return;
        uint256 fromVault = _withdrawFromVault(
            Math.min(amountCollateral_, _vaultWithdrawable()),
            recipient_
        );
        uint256 fromReserve = amountCollateral_ - fromVault;
        if (fromReserve > IERC20(collateral).balanceOf(address(this))) {
            revert AaveHandlerInsufficientBalance();
        }
        if (fromReserve > 0) {
            IERC20(collateral).safeTransfer(recipient_, fromReserve);
        }
        updateSuppliedAmounts(amountCollateral_);
    }

    function _vaultWithdrawable() internal view returns (uint256) {
        uint256 shareBal = IERC20(aCollateral).balanceOf(address(this));
        uint256 assetsCover = IERC4626(aCollateral).convertToAssets(shareBal);
        uint256 vaultMax = IERC4626(aCollateral).maxWithdraw(address(this));
        return Math.min(assetsCover, vaultMax);
    }

    /// @dev Leave `liquidReserveTarget` GHO idle. Deposit only the excess that sGHO will accept.
    function _deployExcessAboveReserve() internal {
        uint256 liquid = IERC20(collateral).balanceOf(address(this));
        if (liquid <= liquidReserveTarget) return;
        uint256 toDeploy = Math.min(
            liquid - liquidReserveTarget,
            IERC4626(aCollateral).maxDeposit(address(this))
        );
        if (toDeploy == 0) return;
        IERC4626(aCollateral).deposit(toDeploy, address(this));
    }

    function _withdrawFromVault(
        uint256 amountAssets_,
        address recipient_
    ) internal returns (uint256) {
        if (amountAssets_ == 0) return 0;
        uint256 amount = Math.min(amountAssets_, _vaultWithdrawable());
        if (amount == 0) return 0;
        IERC4626(aCollateral).withdraw(amount, recipient_, address(this));
        emit AaveWithdraw(amount);
        return amount;
    }
}
