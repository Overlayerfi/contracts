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
    bytes32 private constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    /// @notice Blacklisted accounts role
    bytes32 private constant BLACKLISTED_ROLE = keccak256("BLACKLISTED_ROLE");

    /// @notice Ensure account is not blacklisted
    modifier notDisabled(address account_) {
        if (hasRole(BLACKLISTED_ROLE, account_)) {
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
    /// @param params_ A struct containing:
    ///        - admin: Address of the contract administrator
    ///        - name: Token name
    ///        - symbol: Token symbol
    ///        - collateral: Configuration for the main collateral token
    ///        - aCollateral: Configuration for the associated collateral token
    ///        - maxMintPerBlock: Maximum amount that can be minted per block
    ///        - maxRedeemPerBlock: Maximum amount that can be redeemed per block
    constructor(ConstructorParams memory params_) OverlayerWrapCore(params_) {
        OverlayerWrapCore._initialize(
            params_.collateral,
            params_.aCollateral,
            params_.admin,
            params_.maxMintPerBlock,
            params_.maxRedeemPerBlock,
            params_.hubChainId
        );

        if (params_.admin == address(0))
            revert OverlayerWrapZeroAddressException();
    }

    /// @notice Mint tokens
    /// @dev Can be paused by the admin
    /// @param order_ A struct containing the mint order
    function mint(
        OverlayerWrapCoreTypes.Order calldata order_
    )
        external
        notDisabled(msg.sender)
        notDisabled(order_.benefactor)
        notDisabled(order_.beneficiary)
        nonReentrant
    {
        if (order_.benefactor != msg.sender)
            revert OverlayerWrapCoreInvalidBenefactor();
        _managerMint(order_);
        _mint(order_.beneficiary, order_.overlayerWrapAmount);
        emit Mint(
            msg.sender,
            order_.benefactor,
            order_.beneficiary,
            order_.collateral,
            order_.collateralAmount,
            order_.overlayerWrapAmount
        );
    }

    /// @notice Sets the blacklist time.
    /// @dev Disables blakclist if time is zero.
    /// @param time_ The timestamp.
    function setBlackListTime(
        uint256 time_
    ) external onlyRole(CONTROLLER_ROLE) {
        if (time_ > 0 && time_ < block.timestamp) {
            revert OverlayerWrapBlacklistTimeNotValid();
        }
        blacklistActivationTime = time_;
    }

    /// @notice Redeem collateral
    /// @dev Can not be paused
    /// @param order_ A struct containing the mint order
    function redeem(
        OverlayerWrapCoreTypes.Order calldata order_
    )
        external
        notDisabled(msg.sender)
        notDisabled(order_.benefactor)
        notDisabled(order_.beneficiary)
        nonReentrant
    {
        (uint256 toBurn, uint256 back) = _managerRedeem(order_);
        if (msg.sender == order_.benefactor) {
            _burn(msg.sender, toBurn);
        } else {
            burnFrom(order_.benefactor, toBurn);
        }
        emit Redeem(
            msg.sender,
            order_.benefactor,
            order_.beneficiary,
            order_.collateral,
            back,
            toBurn
        );
    }

    /// @notice Disable an account from performing transactions
    /// @param account_ The account to be disabled
    function disableAccount(
        address account_
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) {
        _grantRole(BLACKLISTED_ROLE, account_);
        emit DisableAccount(account_);
    }

    /// @notice Enable an account from performing transactions
    /// @param account_ The account to be enabled
    function enableAccount(
        address account_
    ) external blacklistAllowed onlyRole(CONTROLLER_ROLE) {
        _revokeRole(BLACKLISTED_ROLE, account_);
        emit EnableAccount(account_);
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(
        address from_,
        address to_,
        uint256 value_
    ) internal override notDisabled(from_) notDisabled(to_) {
        super._update(from_, to_, value_);
    }
}
