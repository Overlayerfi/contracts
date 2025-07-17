// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "../shared/SingleAdminAccessControl.sol";
import "./interfaces/IStakedOverlayerWrap.sol";

/**
 * @title StakedOverlayerWrap
 * @notice Base contract for staking OverlayerWrap tokens with vesting and blacklisting functionality
 * @dev This contract is intended to be inherited in order to define custom vesting (cooldowns) policies
 */
abstract contract StakedOverlayerWrap is
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
    bytes32 private constant BLACKLIST_MANAGER_ROLE =
        keccak256("BLACKLIST_MANAGER_ROLE");
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

    /* ------------- STATE VARIABLES ------------- */

    /// @notice The amount of the last asset distribution from the controller contract into this
    /// contract + any unvested remainder at that time
    uint256 public vestingAmount;

    /// @notice The timestamp of the last asset distribution from the controller contract into this contract
    uint256 public lastDistributionTimestamp;

    /// @notice The timestamp of the last blacklist activation request
    uint256 public blacklistActivationTime;

    /// @notice OverlayerWrap backing contract
    address public overlayerWrapBacking;

    /* ------------- MODIFIERS ------------- */

    /// @notice Ensure input amount nonzero
    modifier notZero(uint256 amount) {
        if (amount == 0) revert StakedOverlayerWrapInvalidAmount();
        _;
    }

    /// @notice Ensures blacklist target is not owner
    modifier notOwner(address target) {
        if (target == owner()) revert StakedOverlayerWrapCantBlacklistOwner();
        _;
    }

    /// @notice Ensures blacklist is on
    modifier blacklistAllowed() {
        if (
            blacklistActivationTime == 0 ||
            blacklistActivationTime + BLACKLIST_ACTIVATION_TIME >
            block.timestamp
        ) {
            revert StakedOverlayerWrapCannotBlacklist();
        }
        _;
    }

    /* ------------- CONSTRUCTOR ------------- */

    /**
     * @notice Constructor for StakedOverlayerWrap contract.
     * @param asset_ The address of the OverlayerWrap token.
     * @param initialRewarder The address of the initial rewarder.
     * @param admin The address of the admin role.
     * @param vestingPeriod The rewards vesting period
     */
    constructor(
        IERC20 asset_,
        address initialRewarder,
        address admin,
        uint256 vestingPeriod
    )
        ERC20("Staked OverlayerWrap", "sOverlayerWrap")
        ERC4626(asset_)
        ERC20Permit("sOverlayerWrap")
    {
        if (
            admin == address(0) ||
            initialRewarder == address(0) ||
            address(asset_) == address(0)
        ) {
            revert StakedOverlayerWrapInvalidZeroAddress();
        }

        _grantRole(REWARDER_ROLE, initialRewarder);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        _vestingPeriod = vestingPeriod;
    }

    /* ------------- EXTERNAL ------------- */

    /**
     * @notice Allows the owner to transfer rewards from the controller contract into this contract.
     * @param amount The amount of rewards to transfer.
     */
    function transferInRewards(
        uint256 amount
    ) external nonReentrant onlyRole(REWARDER_ROLE) notZero(amount) {
        _updateVestingAmount(amount);
        // transfer assets from rewarder to this contract
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit RewardsReceived(amount);
    }

    /**
     * @notice Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to blacklist addresses.
     * @param target The address to blacklist.
     * @param isFullBlacklisting Soft or full blacklisting level.
     */
    function addToBlacklist(
        address target,
        bool isFullBlacklisting
    )
        external
        blacklistAllowed
        onlyRole(BLACKLIST_MANAGER_ROLE)
        notOwner(target)
    {
        bytes32 role = isFullBlacklisting
            ? WHOLE_RESTRICTED_ROLE
            : STAKE_RESTRICTED_ROLE;
        _grantRole(role, target);
    }

    /**
     * @notice Allows the owner (DEFAULT_ADMIN_ROLE) and blacklist managers to un-blacklist addresses.
     * @param target The address to un-blacklist.
     * @param isFullBlacklisting Soft or full blacklisting level.
     */
    function removeFromBlacklist(
        address target,
        bool isFullBlacklisting
    ) external blacklistAllowed onlyRole(BLACKLIST_MANAGER_ROLE) {
        bytes32 role = isFullBlacklisting
            ? WHOLE_RESTRICTED_ROLE
            : STAKE_RESTRICTED_ROLE;
        _revokeRole(role, target);
    }

    /**
     * @notice Sets the blacklist time.
     * @dev Disables blakclist if time is zero.
     * @param time The starting timestamp.
     */
    function setBlackListTime(
        uint256 time
    ) external onlyRole(BLACKLIST_MANAGER_ROLE) {
        if (time > 0 && time < block.timestamp) {
            revert StakedOverlayerWrapInvalidTime();
        }
        blacklistActivationTime = time;
    }

    /**
     * @notice Sets the overlayerWrap backing contract
     * @dev Zero address not disable
     * @param backing The overlayerWrap backing contract
     */
    function setOverlayerWrapBacking(
        address backing
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        overlayerWrapBacking = backing;
        emit OverlayerWrapBackingSet(backing);
    }

    /**
     * @notice Allows the owner to rescue tokens accidentally sent to the contract.
     * Note that the owner cannot rescue OverlayerWrap tokens because they functionally sit here
     * and belong to stakers but can rescue staked OverlayerWrap as they should never actually
     * sit in this contract and a staker may well transfer them here by accident.
     * @param token The token to be rescued.
     * @param amount The amount of tokens to be rescued.
     * @param to Where to send rescued tokens
     */
    function rescueTokens(
        address token,
        uint256 amount,
        address to
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(token) == asset()) revert StakedOverlayerWrapInvalidToken();
        IERC20(token).safeTransfer(to, amount);
    }

    /**
     * @dev Burns the full restricted user amount and mints to the desired owner address.
     * @param from The address to burn the entire balance, with the WHOLE_RESTRICTED_ROLE
     * @param to The address to mint the entire balance of "from" parameter.
     */
    function redistributeLockedAmount(
        address from,
        address to
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert StakedOverlayerWrapInvalidZeroAddress();
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, from) &&
            (!hasRole(WHOLE_RESTRICTED_ROLE, to) &&
                !hasRole(STAKE_RESTRICTED_ROLE, to))
        ) {
            uint256 amountToDistribute = balanceOf(from);
            _burn(from, amountToDistribute);
            // to address of address(0) enables burning
            _mint(to, amountToDistribute);

            emit LockedAmountRedistributed(from, to, amountToDistribute);
        } else {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
    }

    /* ------------- PUBLIC ------------- */

    /**
     * @notice Returns the amount of OverlayerWrap tokens that are vested in the contract.
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) - getUnvestedAmount();
    }

    /**
     * @notice Returns the amount of OverlayerWrap tokens that are unvested in the contract.
     */
    function getUnvestedAmount() public view returns (uint256) {
        uint256 timeSinceLastDistribution = block.timestamp -
            lastDistributionTimestamp;

        if (timeSinceLastDistribution >= _vestingPeriod) {
            return 0;
        } else {
            uint256 deltaT;
            unchecked {
                deltaT = (_vestingPeriod - timeSinceLastDistribution);
            }
            return (deltaT * vestingAmount) / _vestingPeriod;
        }
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
     * @param caller sender of assets
     * @param receiver where to send shares
     * @param assets assets to deposit
     * @param shares shares to mint
     */
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant notZero(assets) notZero(shares) {
        if (
            hasRole(STAKE_RESTRICTED_ROLE, caller) ||
            hasRole(STAKE_RESTRICTED_ROLE, receiver)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, caller) ||
            hasRole(WHOLE_RESTRICTED_ROLE, receiver)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        super._deposit(caller, receiver, assets, shares);
        _checkMinShares();
    }

    /**
     * @dev Withdraw/redeem common workflow.
     * @param caller tx sender
     * @param receiver where to send assets
     * @param sharesOwner where to burn shares from
     * @param assets asset amount to transfer out
     * @param shares shares to burn
     */
    function _withdraw(
        address caller,
        address receiver,
        address sharesOwner,
        uint256 assets,
        uint256 shares
    ) internal override nonReentrant notZero(assets) notZero(shares) {
        if (
            hasRole(WHOLE_RESTRICTED_ROLE, caller) ||
            hasRole(WHOLE_RESTRICTED_ROLE, receiver) ||
            hasRole(WHOLE_RESTRICTED_ROLE, sharesOwner)
        ) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }

        super._withdraw(caller, receiver, sharesOwner, assets, shares);
        _checkMinShares();
    }

    /// @notice Update vesting amount and timestamp for new rewards distribution
    /// @param newVestingAmount Amount of tokens to vest over time
    /// @dev Reverts if there are still unvested tokens from previous distribution
    function _updateVestingAmount(uint256 newVestingAmount) internal {
        if (getUnvestedAmount() > 0) revert StakedOverlayerWrapStillVesting();

        vestingAmount = newVestingAmount;
        lastDistributionTimestamp = block.timestamp;
    }

    /**
     * @notice Override of ERC20 transfer logic to handle restricted accounts
     * @dev Prevents transfers involving accounts with WHOLE_RESTRICTED_ROLE
     * @param from Source address
     * @param to Destination address
     * @param value Amount to transfer
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override {
        if (hasRole(WHOLE_RESTRICTED_ROLE, from) && to != address(0)) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        if (hasRole(WHOLE_RESTRICTED_ROLE, to)) {
            revert StakedOverlayerWrapOperationNotAllowed();
        }
        super._update(from, to, value);
    }
}
