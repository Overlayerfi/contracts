// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./MintRedeemManager.sol";
import "./interfaces/IOverlayerWrapDefs.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title OverlayerWrap
 * @notice The Dual Layer stable coin
 */
contract OverlayerWrap is
    ERC20Burnable,
    ERC20Permit,
    IOverlayerWrapDefs,
    MintRedeemManager
{
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

    /// @notice Constructor
    /// @param admin The contract admin
    /// @param collateral_ The main collateral struct
    /// @param aCollateral_ The main collateral struct, aToken version
    /// @param maxMintPerBlock_ Max mint amount for each block
    /// @param maxRedeemPerBlock_ Max redeem amount for each block
    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    )
        ERC20("OverlayerWrap", "OverlayerWrap")
        ERC20Permit("OverlayerWrap")
        MintRedeemManager(
            collateral_,
            aCollateral_,
            admin,
            decimals(),
            maxMintPerBlock_,
            maxRedeemPerBlock_
        )
    {
        if (admin == address(0)) revert OverlayerWrapZeroAddressException();
        if (decimals() < collateral_.decimals) {
            revert OverlayerWrapInvalidDecimals();
        }
    }

    /// @notice Mint tokens
    /// @dev Can be paused by the admin
    /// @param order A struct containing the mint order
    function mint(
        MintRedeemManagerTypes.Order calldata order
    ) external nonReentrant {
        if (order.benefactor != msg.sender)
            revert MintRedeemManagerInvalidBenefactor();
        _managerMint(order);
        _mint(order.beneficiary, order.overlayerWrap_amount);
        emit Mint(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral,
            order.collateral_amount,
            order.overlayerWrap_amount
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
        MintRedeemManagerTypes.Order calldata order
    ) external nonReentrant {
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
