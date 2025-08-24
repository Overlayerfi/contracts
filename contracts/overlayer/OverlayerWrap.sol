// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./OverlayerWrapCore.sol";
import "./interfaces/IOverlayerWrapDefs.sol";
import "./types/OverlayerWrapCoreTypes.sol";

/**
 * @title OverlayerWrap
 * @notice The stable coin Overlayer
 */
contract OverlayerWrap is IOverlayerWrapDefs, OverlayerWrapCore {
    /// @notice The timestamp of the last blacklist activation request
    uint256 public blacklistActivationTime;

    /// @notice Time delay for blacklisting to be activated
    uint256 public constant BLACKLIST_ACTIVATION_TIME = 15 days;

    /// @notice Role enabling to disable or enable ERC20 _update for a given address
    bytes32 private constant CONTROLLER_ROLE =
        keccak256("BLACKLIST_MANAGER_ROLE");

    /// @notice Blacklisted accounts role
    bytes32 private constant BLACKLISTED_ROLE = keccak256("BLACKLISTED_ROLE");

    /// @notice Ensure account is not blacklisted
    modifier notDisabled(address account) {
        if (hasRole(BLACKLISTED_ROLE, account)) {
            revert OverlayerWrapAccountDisabled();
        }
        _;
    }

    /// @notice Ensure blacklisting is allowed
    modifier blacklistAllowed() {
        if (
            blacklistActivationTime == 0 ||
            blacklistActivationTime + BLACKLIST_ACTIVATION_TIME >
            block.timestamp
        ) {
            revert OverlayerWrapBlacklistNotActive();
        }
        _;
    }

    /// @notice Constructor initializes the OverlayerWrap token
    /// @param params A struct containing:
    ///        - admin: Address of the contract administrator
    ///        - name: Token name
    ///        - symbol: Token symbol
    ///        - collateral: Configuration for the main collateral token
    ///        - aCollateral: Configuration for the associated collateral token
    ///        - maxMintPerBlock: Maximum amount that can be minted per block
    ///        - maxRedeemPerBlock: Maximum amount that can be redeemed per block
    constructor(ConstructorParams memory params) OverlayerWrapCore(params) {
        OverlayerWrapCore._initialize(
            params.collateral,
            params.aCollateral,
            params.admin,
            params.maxMintPerBlock,
            params.maxRedeemPerBlock
        );
        if (params.admin == address(0))
            revert OverlayerWrapZeroAddressException();
        if (decimals() < params.collateral.decimals) {
            revert OverlayerWrapInvalidDecimals();
        }
    }

    /// @notice Mint tokens
    /// @dev Can be paused by the admin
    /// @param order A struct containing the mint order
    function mint(
        OverlayerWrapCoreTypes.Order calldata order
    ) external notDisabled(order.beneficiary) nonReentrant {
        if (order.benefactor != msg.sender)
            revert OverlayerWrapCoreInvalidBenefactor();
        _managerMint(order);
        _mint(order.beneficiary, order.overlayerWrapAmount);
        emit Mint(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral,
            order.collateralAmount,
            order.overlayerWrapAmount
        );
    }

    /// @notice Sets the blacklist time.
    /// @dev Disables blakclist if time is zero.
    /// @param time The timestamp.
    function setBlackListTime(uint256 time) external onlyRole(CONTROLLER_ROLE) {
        if (time > 0 && time < block.timestamp) {
            revert OverlayerWrapBlacklistTimeNotValid();
        }
        blacklistActivationTime = time;
    }

    /// @notice Redeem collateral
    /// @dev Can not be paused
    /// @param order A struct containing the mint order
    function redeem(
        OverlayerWrapCoreTypes.Order calldata order
    ) external notDisabled(order.benefactor) nonReentrant {
        (uint256 toBurn, uint256 back) = _managerRedeem(order);
        if (msg.sender == order.benefactor) {
            _burn(msg.sender, toBurn);
        } else {
            burnFrom(order.benefactor, toBurn);
        }
        emit Redeem(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral,
            back,
            toBurn
        );
    }

    /// @notice Disable an account from performing transactions
    /// @param account The account to be disabled
    function disableAccount(
        address account
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) {
        _grantRole(BLACKLISTED_ROLE, account);
        emit DisableAccount(account);
    }

    /// @notice Enable an account from performing transactions
    /// @param account The account to be enabled
    function enableAccount(
        address account
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) {
        _revokeRole(BLACKLISTED_ROLE, account);
        emit EnableAccount(account);
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override notDisabled(from) notDisabled(to) {
        super._update(from, to, value);
    }
}
