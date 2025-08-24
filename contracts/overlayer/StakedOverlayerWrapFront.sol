// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable var-name-mixedcase */

import "./StakedOverlayerWrap.sol";
import "./interfaces/IStakedOverlayerWrapCoolDown.sol";
import "./OverlayerWrapSilo.sol";
import "../overlayerbacking/interfaces/IOverlayerWrapBacking.sol";

/**
 * @title StakedOverlayerWrapFront
 * @notice Public interface for staking OverlayerWrap tokens with cooldown functionality
 * @dev Supports two modes of operation:
 *      1. Standard ERC4626 mode when cooldown is disabled (duration = 0)
 *      2. Cooldown mode with custom unstaking process when duration > 0
 */
contract StakedOverlayerWrapFront is
    IStakedOverlayerWrapCooldown,
    StakedOverlayerWrap
{
    using SafeERC20 for IERC20;

    mapping(address => UserCooldown) public cooldowns;

    /// @notice Silo contract for holding tokens during cooldown
    OverlayerWrapSilo public immutable SILO;

    /// @notice Maximum allowed cooldown duration (90 days)
    uint24 public constant MAX_COOLDOWN_DURATION = 90 days;

    /// @notice Current cooldown duration for unstaking
    uint24 public cooldownDuration;

    /// @notice Flag to control Aave withdrawal during compound operations
    bool public withdrawAaveDuringCompound;

    /// @notice Ensure cooldownDuration is zero
    modifier ensureCooldownOff() {
        if (cooldownDuration != 0)
            revert StakedOverlayerWrapOperationNotAllowed();
        _;
    }

    /// @notice Ensure cooldownDuration is gt 0
    modifier ensureCooldownOn() {
        if (cooldownDuration == 0)
            revert StakedOverlayerWrapOperationNotAllowed();
        _;
    }

    /// @notice Constructor for StakedOverlayerWrapFront
    /// @param asset_ The OverlayerWrap token contract address
    /// @param initialRewarder Address authorized to distribute rewards
    /// @param admin Contract administrator address
    /// @param vestingPeriod Duration over which rewards are vested
    /// @dev Initializes with maximum cooldown duration and Aave withdrawals enabled
    constructor(
        IERC20 asset_,
        address initialRewarder,
        address admin,
        uint256 vestingPeriod
    ) StakedOverlayerWrap(asset_, initialRewarder, admin, vestingPeriod) {
        SILO = new OverlayerWrapSilo(address(this), address(asset_));
        cooldownDuration = MAX_COOLDOWN_DURATION;
        withdrawAaveDuringCompound = true;
    }

    /* ------------- EXTERNAL ------------- */

    /**
     * @dev See {IERC4626-withdraw}.
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address _owner
    ) public virtual override ensureCooldownOff returns (uint256) {
        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }
        return super.withdraw(assets, receiver, _owner);
    }

    /**
     * @dev See {IERC4626-redeem}.
     */
    function redeem(
        uint256 shares,
        address receiver,
        address _owner
    ) public virtual override ensureCooldownOff returns (uint256) {
        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }
        return super.redeem(shares, receiver, _owner);
    }

    /// @notice Claim the staking amount after the cooldown has finished. The address can only retire the full amount of assets.
    /// @dev Unstake can be called after cooldown have been set to 0, to let accounts to be able to claim remaining assets locked at Silo
    /// @param receiver Address to send the assets by the staker
    function unstake(address receiver) external nonReentrant {
        UserCooldown storage userCooldown = cooldowns[msg.sender];
        uint256 assets = userCooldown.underlyingAmount;

        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }

        if (
            block.timestamp >= userCooldown.cooldownEnd || cooldownDuration == 0
        ) {
            userCooldown.cooldownEnd = 0;
            userCooldown.underlyingAmount = 0;

            SILO.withdraw(receiver, assets);
        } else {
            revert IStakedOverlayerWrapCooldownInvalidCooldown();
        }
    }

    /// @notice Redeem assets and starts a cooldown to claim the converted underlying asset
    /// @param assets Assets to redeem
    function cooldownAssets(
        uint256 assets
    ) external ensureCooldownOn returns (uint256 shares) {
        if (assets > maxWithdraw(msg.sender))
            revert IStakedOverlayerWrapCooldownExcessiveWithdrawAmount();

        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }

        shares = previewWithdraw(assets);

        cooldowns[msg.sender].cooldownEnd =
            uint104(block.timestamp) +
            cooldownDuration;
        cooldowns[msg.sender].underlyingAmount += uint152(assets);

        _withdraw(msg.sender, address(SILO), msg.sender, assets, shares);
    }

    /// @notice Redeem shares into assets and starts a cooldown to claim the converted underlying asset
    /// @param shares Shares to redeem
    function cooldownShares(
        uint256 shares
    ) external ensureCooldownOn returns (uint256 assets) {
        if (shares > maxRedeem(msg.sender))
            revert IStakedOverlayerWrapCooldownExcessiveRedeemAmount();

        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound(
                withdrawAaveDuringCompound
            );
        }

        assets = previewRedeem(shares);

        cooldowns[msg.sender].cooldownEnd =
            uint104(block.timestamp) +
            cooldownDuration;
        cooldowns[msg.sender].underlyingAmount += uint152(assets);

        _withdraw(msg.sender, address(SILO), msg.sender, assets, shares);
    }

    /// @notice Set cooldown duration. If cooldown duration is set to zero, the StakedOverlayerWrapFront behavior changes to follow ERC4626 standard and disables
    /// cooldownShares and cooldownAssets methods. If cooldown duration is greater than zero, the ERC4626 withdrawal and redeem functions are disabled,
    /// breaking the ERC4626 standard, and enabling the cooldownShares and the cooldownAssets functions.
    /// @param duration Duration of the cooldown
    function setCooldownDuration(
        uint24 duration
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (duration > MAX_COOLDOWN_DURATION) {
            revert IStakedOverlayerWrapCooldownInvalidCooldown();
        }

        uint24 previousDuration = cooldownDuration;
        cooldownDuration = duration;
        emit IStakedOverlayerWrapCooldownDurationUpdated(
            previousDuration,
            cooldownDuration
        );
    }

    /// @notice Controls whether Aave tokens should be withdrawn during compound operations
    /// @param doWithdraw True to enable Aave withdrawals, false to disable
    /// @dev Can only be called by contract admin
    function setWithdrawAaveDuringCompound(
        bool doWithdraw
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        withdrawAaveDuringCompound = doWithdraw;
    }
}
