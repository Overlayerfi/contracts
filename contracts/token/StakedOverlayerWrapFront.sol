// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable var-name-mixedcase */

import "./StakedOverlayerWrap.sol";
import "./interfaces/IStakedOverlayerWrapCoolDown.sol";
import "./OverlayerWrapSilo.sol";
import "../backing/interfaces/IOverlayerWrapBacking.sol";

/**
 * @title StakedOverlayerWrapFront
 * @notice The StakedOverlayerWrapFront contract allows users to
 * stake OverlayerWrap tokens and earn a portion of protocol yield. This is the public entrypoint
 * @dev If cooldown duration is set to
 * zero, the StakedOverlayerWrapFront behavior changes to follow ERC4626 standard and
 * disables cooldownShares and cooldownAssets methods. If cooldown duration is
 * greater than zero, the ERC4626 withdrawal and redeem functions are disabled,
 * breaking the ERC4626 standard, and enabling the cooldownShares and the
 * cooldownAssets functions.
 */
contract StakedOverlayerWrapFront is IStakedOverlayerWrapCooldown, StakedOverlayerWrap {
    using SafeERC20 for IERC20;

    mapping(address => UserCooldown) public cooldowns;

    OverlayerWrapSilo public immutable SILO;

    uint24 public constant MAX_COOLDOWN_DURATION = 90 days;

    uint24 public cooldownDuration;

    /// @notice Ensure cooldownDuration is zero
    modifier ensureCooldownOff() {
        if (cooldownDuration != 0) revert StakedOverlayerWrapOperationNotAllowed();
        _;
    }

    /// @notice Ensure cooldownDuration is gt 0
    modifier ensureCooldownOn() {
        if (cooldownDuration == 0) revert StakedOverlayerWrapOperationNotAllowed();
        _;
    }

    /// @notice Constructor for StakedOverlayerWrapFront contract.
    /// @param _asset The address of the OverlayerWrap token.
    /// @param initialRewarder The address of the initial rewarder.
    /// @param _owner The address of the admin role.
    /// @param vestingPeriod The rewards vesting period
    constructor(
        IERC20 _asset,
        address initialRewarder,
        address _owner,
        uint256 vestingPeriod
    ) StakedOverlayerWrap(_asset, initialRewarder, _owner, vestingPeriod) {
        SILO = new OverlayerWrapSilo(address(this), address(_asset));
        cooldownDuration = MAX_COOLDOWN_DURATION;
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
            IOverlayerWrapBacking(overlayerWrapBacking).compound();
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
            IOverlayerWrapBacking(overlayerWrapBacking).compound();
        }
        return super.redeem(shares, receiver, _owner);
    }

    /// @notice Claim the staking amount after the cooldown has finished. The address can only retire the full amount of assets.
    /// @dev Unstake can be called after cooldown have been set to 0, to let accounts to be able to claim remaining assets locked at Silo
    /// @param receiver Address to send the assets by the staker
    function unstake(address receiver) external {
        UserCooldown storage userCooldown = cooldowns[msg.sender];
        uint256 assets = userCooldown.underlyingAmount;

        if (overlayerWrapBacking != address(0)) {
            IOverlayerWrapBacking(overlayerWrapBacking).compound();
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
            IOverlayerWrapBacking(overlayerWrapBacking).compound();
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
            IOverlayerWrapBacking(overlayerWrapBacking).compound();
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
}
