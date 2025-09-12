// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

/* solhint-disable private-vars-leading-underscore */

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "../shared/SingleAdminAccessControl.sol";
import "./interfaces/IStakedOverlayerWrap.sol";

/**
 * @title StakedOverlayerWrapCore
 * @notice Base contract for staking OverlayerWrap tokens with vesting and blacklisting functionality
 * @dev This contract is intended to be inherited in order to define custom vesting (cooldowns) policies
 */
abstract contract StakedOverlayerWrapCore is
    SingleAdminAccessControl,
    ReentrancyGuard,
    ERC20Permit,
    ERC4626,
    IStakedOverlayerWrap
{
    using SafeERC20 for IERC20;

    /* ------------- CONSTANTS ------------- */
    /// @notice The role that is allowed to distribute rewards to this contract
    bytes32 private constant REWARDER_ROLE = keccak256("REWARDER_ROLE");
    /// @notice The role that is allowed to blacklist and un-blacklist addresses
    bytes32 private constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");
    /// @notice The role which prevents an address to stake
    bytes32 private constant STAKE_RESTRICTED_ROLE =
        keccak256("STAKE_RESTRICTED_ROLE");
    /// @notice The role which prevents an address to transfer, stake, or unstake. The owner of the contract can redirect address staking balance if an address is in full restricting mode.
    bytes32 private constant WHOLE_RESTRICTED_ROLE =
        keccak256("WHOLE_RESTRICTED_ROLE");
    /// @notice The vesting period of lastDistributionAmount over which it increasingly becomes available to stakers
    uint256 private _vestingPeriod;
    /// @notice Minimum non-zero shares amount to prevent donation attack
    uint256 private constant MIN_SHARES = 1 ether;
    /// @notice Time delay for blacklisting to be activated
    uint256 public constant BLACKLIST_ACTIVATION_TIME = 15 days;
    /// @notice Time delay for asset redistribution to be activated
    uint256 public constant REDISTRIBUTION_ACTIVATION_TIME = 15 days;

    /* ------------- STATE VARIABLES ------------- */

    /// @notice The amount of the last asset distribution from the controller contract into this
    /// contract + any unvested remainder at that time
    uint256 public vestingAmount;

    /// @notice The timestamp of the last asset distribution from the controller contract into this contract
    uint256 public lastDistributionTimestamp;

    /// @notice The timestamp of the last blacklist activation request
    uint256 public blacklistActivationTime;

    /// @notice The timestamp of the last redistribution activation request
    uint256 public redistributionActivationTime;

    /// @notice OverlayerWrap backing contract
    address public overlayerWrapBacking;

    /* ------------- MODIFIERS ------------- */

    /// @notice Ensure input amount nonzero
    modifier notZero(uint256 amount_) {
        if (amount_ == 0) revert StakedOverlayerWrapInvalidAmount();
        _;
    }

    /// @notice Ensures blacklist target is not owner
    modifier notOwner(address target_) {
        if (target_ == owner()) revert StakedOverlayerWrapCantBlacklistOwner();
        _;
    }

    /// @notice Ensures blacklist is on
    modifier blacklistAllowed() {
        if (blacklistActivationTime == 0) {
            revert StakedOverlayerWrapCannotBlacklist();
        }
        if (
            blacklistActivationTime + BLACKLIST_ACTIVATION_TIME >
            block.timestamp ||
            redistributionActivationTime > 0
        ) {
            revert StakedOverlayerWrapCannotBlacklist();
        }
        _;
    }

    /// @notice Ensures redistribution is on
    modifier redistributionAllowed() {
        if (redistributionActivationTime == 0) {
            revert StakedOverlayerWrapCannotRedistribute();
        }
        if (
            redistributionActivationTime + REDISTRIBUTION_ACTIVATION_TIME >
            block.timestamp ||
            blacklistActivationTime > 0
        ) {
            revert StakedOverlayerWrapCannotRedistribute();
        }
        _;
    }

    /* ------------- CONSTRUCTOR ------------- */

    /**
     * @notice Constructor for StakedOverlayerWrapCore contract.
     * @param asset_ The address of the OverlayerWrap token.
     * @param initialRewarder_ The address of the initial rewarder.
     * @param admin_ The address of the admin role.
     * @param vestingPeriod_ The rewards vesting period
     */
    constructor(
        IERC20 asset_,
        address initialRewarder_,
        address admin_,
        uint256 vestingPeriod_
    )
        ERC20("Staked OverlayerWrap", "sOverlayerWrap")
        ERC4626(asset_)
        ERC20Permit("sOverlayerWrap")
    {
        if (
            admin_ == address(0) ||
            initialRewarder_ == address(0) ||
            address(asset_) == address(0)
        ) {
            revert StakedOverlayerWrapInvalidZeroAddress();
        }

        _grantRole(REWARDER_ROLE, initialRewarder_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        _vestingPeriod = vestingPeriod_;
    }

    /* ------------- EXTERNAL ------------- */

    /**
     * @notice Allows the owner to transfer rewards from the controller contract into this contract.
     * @param amount_ The amount of rewards to transfer.
     */
    function transferInRewards(
        uint256 amount_
    ) external nonReentrant onlyRole(REWARDER_ROLE) notZero(amount_) {
        _updateVestingAmount(amount_);
        // transfer assets from rewarder to this contract
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount_);

        emit RewardsReceived(amount_);
    }

    /**
     * @notice Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to blacklist addresses.
     * @param target_ The address to blacklist.
     * @param isFullBlacklisting_ Soft or full blacklisting level.
     */
    function addToBlacklist(
        address target_,
        bool isFullBlacklisting_
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) notOwner(target_) {
        bytes32 role = isFullBlacklisting_
            ? WHOLE_RESTRICTED_ROLE
            : STAKE_RESTRICTED_ROLE;
        _grantRole(role, target_);
    }

    /**
     * @notice Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to un-blacklist addresses.
     * @param target_ The address to un-blacklist.
     * @param isFullBlacklisting_ Soft or full blacklisting level.
     */
    function removeFromBlacklist(
        address target_,
        bool isFullBlacklisting_
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) {
        bytes32 role = isFullBlacklisting_
            ? WHOLE_RESTRICTED_ROLE
            : STAKE_RESTRICTED_ROLE;
        _revokeRole(role, target_);
    }

    /**
     * @notice Sets the blacklist time.
     * @dev Disables blakclist if time is zero.
     * @param time_ The starting timestamp.
     */
    function setBlackListTime(
        uint256 time_
    ) external onlyRole(CONTROLLER_ROLE) {
        if (time_ > 0 && time_ < block.timestamp) {
            revert StakedOverlayerWrapInvalidTime();
        }
        if (redistributionActivationTime > 0) {
            revert StakedOverlayerWrapCannotBlacklist();
        }
        blacklistActivationTime = time_;
    }

    /**
     * @notice Sets the redistribution time.
     * @dev Disables redistribution if time is zero.
     * @param time_ The starting timestamp.
     */
    function setRedistributionTime(
        uint256 time_
    ) external onlyRole(CONTROLLER_ROLE) {
        if (time_ > 0 && time_ < block.timestamp) {
            revert StakedOverlayerWrapInvalidTime();
        }
        if (blacklistActivationTime > 0) {
            revert StakedOverlayerWrapCannotRedistribute();
        }
        redistributionActivationTime = time_;
    }

    /**
     * @notice Sets the overlayerWrap backing contract
     * @dev Zero address not disable
     * @param backing_ The overlayerWrap backing contract
     */
    function setOverlayerWrapBacking(
        address backing_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        overlayerWrapBacking = backing_;
        emit OverlayerWrapBackingSet(backing_);
    }

    /**
     * @notice Allows the owner to rescue tokens accidentally sent to the contract.
     * Note that the owner cannot rescue OverlayerWrap tokens because they functionally sit here
     * and belong to stakers but can rescue staked OverlayerWrap as they should never actually
     * sit in this contract and a staker may well transfer them here by accident.
     * @param token_ The token to be rescued.
     * @param amount_ The amount of tokens to be rescued.
     * @param to_ Where to send rescued tokens
     */
    function rescueTokens(
        address token_,
        uint256 amount_,
        address to_
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(token_) == asset())
            revert StakedOverlayerWrapInvalidToken();
        IERC20(token_).safeTransfer(to_, amount_);
    }

    /**
     * @dev Burns the full restricted user amount and mints to the desired owner address.
     * @param from_ The address to burn the entire balance, with the WHOLE_RESTRICTED_ROLE
     * @param to_ The address to mint the entire balance of "from" parameter.
     */
    function redistributeLockedAmount(
        address from_,
        address to_
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) redistributionAllowed {
        if (to_ == address(0)) revert StakedOverlayerWrapInvalidZeroAddress();
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, from_) &&
            (!hasRole(WHOLE_RESTRICTED_ROLE, to_) &&
                !hasRole(STAKE_RESTRICTED_ROLE, to_))
        ) {
            uint256 amountToDistribute = balanceOf(from_);
            _burn(from_, amountToDistribute);
            // to address of address(0) enables burning
            _mint(to_, amountToDistribute);

            emit LockedAmountRedistributed(from_, to_, amountToDistribute);
        } else {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
    }

    /* ------------- PUBLIC ------------- */

    /**
     * @notice Returns the amount of OverlayerWrap tokens that are vested in the contract.
     */
    function totalAssets() public view override returns (uint256) {
        uint256 bal = IERC20(asset()).balanceOf(address(this));
        uint256 unvested = getUnvestedAmount();
        return bal > unvested ? bal - unvested : 0;
    }

    /**
     * @notice Returns the amount of OverlayerWrap tokens that are unvested in the contract.
     */
    function getUnvestedAmount() public view returns (uint256) {
        uint256 elapsed = block.timestamp - lastDistributionTimestamp;
        if (elapsed >= _vestingPeriod) return 0;
        uint256 remaining = _vestingPeriod - elapsed;
        return Math.mulDiv(remaining, vestingAmount, _vestingPeriod);
    }

    /// @dev Necessary because both ERC20 (from ERC20Permit) and ERC4626 declare decimals()
    function decimals() public pure override(ERC4626, ERC20) returns (uint8) {
        return 18;
    }

    /**
     * @dev Remove renounce role access from AccessControl, to prevent users to resign roles.
     */
    function renounceRole(bytes32, address) public virtual override {
        revert StakedOverlayerWrapOperationNotAllowed();
    }

    /* ------------- INTERNAL ------------- */

    /// @notice Ensures a small non-zero amount of shares does not remain, exposing to donation attack
    function _checkMinShares() internal view {
        uint256 totalSupply = totalSupply();
        if (totalSupply > 0 && totalSupply < MIN_SHARES)
            revert StakedOverlayerWrapMinSharesViolation();
    }

    /**
     * @dev Deposit/mint common workflow.
     * @param caller_ sender of assets
     * @param receiver_ where to send shares
     * @param assets_ assets to deposit
     * @param shares_ shares to mint
     */
    function _deposit(
        address caller_,
        address receiver_,
        uint256 assets_,
        uint256 shares_
    ) internal override nonReentrant notZero(assets_) notZero(shares_) {
        if (
            hasRole(STAKE_RESTRICTED_ROLE, caller_) ||
            hasRole(STAKE_RESTRICTED_ROLE, receiver_)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, caller_) ||
            hasRole(WHOLE_RESTRICTED_ROLE, receiver_)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        super._deposit(caller_, receiver_, assets_, shares_);
        _checkMinShares();
    }

    /**
     * @dev Withdraw/redeem common workflow.
     * @param caller_ tx sender
     * @param receiver_ where to send assets
     * @param sharesOwner_ where to burn shares from
     * @param assets_ asset amount to transfer out
     * @param shares_ shares to burn
     */
    function _withdraw(
        address caller_,
        address receiver_,
        address sharesOwner_,
        uint256 assets_,
        uint256 shares_
    ) internal override nonReentrant notZero(assets_) notZero(shares_) {
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, caller_) ||
            hasRole(WHOLE_RESTRICTED_ROLE, receiver_) ||
            hasRole(WHOLE_RESTRICTED_ROLE, sharesOwner_)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }

        super._withdraw(caller_, receiver_, sharesOwner_, assets_, shares_);
        _checkMinShares();
    }

    /// @notice Update vesting amount and timestamp for new rewards distribution
    /// @param newVestingAmount_ Amount of tokens to vest over time
    /// @dev Reverts if there are still unvested tokens from previous distribution
    function _updateVestingAmount(uint256 newVestingAmount_) internal {
        if (getUnvestedAmount() > 0) revert StakedOverlayerWrapStillVesting();

        vestingAmount = newVestingAmount_;
        lastDistributionTimestamp = block.timestamp;
    }

    /**
     * @notice Override of ERC20 transfer logic to handle restricted accounts
     * @dev Prevents transfers involving accounts with WHOLE_RESTRICTED_ROLE
     * @param from_ Source address
     * @param to_ Destination address
     * @param value_ Amount to transfer
     */
    function _update(
        address from_,
        address to_,
        uint256 value_
    ) internal virtual override {
        if (hasRole(WHOLE_RESTRICTED_ROLE, from_) && to_ != address(0)) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        if (hasRole(WHOLE_RESTRICTED_ROLE, to_)) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        super._update(from_, to_, value_);
    }
}
