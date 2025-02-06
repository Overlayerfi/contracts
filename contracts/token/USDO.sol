// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./MintRedeemManager.sol";
import "./interfaces/IUSDODefs.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title USDO
 * @notice USDO The starting point...
 */
contract USDO is ERC20Burnable, ERC20Permit, IUSDODefs, MintRedeemManager {
    /// @notice blacklisted accounts
    mapping(address => bool) public blacklist;

    /// @notice role enabling to disable or enable ERC20 _update for a given address
    bytes32 private constant CONTROLLER_ROLE =
        keccak256("BLACKLIST_MANAGER_ROLE");

    modifier notDisabled(address account) {
        if (blacklist[account] == true) {
            revert USDOAccountDisabled();
        }
        _;
    }

    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory usdc_,
        MintRedeemManagerTypes.StableCoin memory usdt_,
        MintRedeemManagerTypes.StableCoin memory aUsdc_,
        MintRedeemManagerTypes.StableCoin memory aUsdt_,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    )
        ERC20("USDO", "USDO")
        ERC20Permit("USDO")
        MintRedeemManager(
            usdc_,
            usdt_,
            aUsdc_,
            aUsdt_,
            admin,
            decimals(),
            maxMintPerBlock_,
            maxRedeemPerBlock_
        )
    {
        if (admin == address(0)) revert USDOZeroAddressException();
        if (decimals() < usdc_.decimals || decimals() < usdt_.decimals) {
            revert USDOInvalidDecimals();
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
        _mint(order.beneficiary, order.usdo_amount);
        emit Mint(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral_usdc,
            order.collateral_usdt,
            order.collateral_usdc_amount,
            order.collateral_usdt_amount,
            order.usdo_amount
        );
    }

    /// @notice Redeem collateral
    /// @dev Can not be paused
    /// @param order A struct containing the mint order
    function redeem(
        MintRedeemManagerTypes.Order calldata order
    ) external nonReentrant {
        (uint256 toBurn, uint256 usdcBack, uint256 usdtBack) = _managerRedeem(
            order
        );
        if (msg.sender == order.benefactor) {
            _burn(msg.sender, toBurn);
        } else {
            burnFrom(order.benefactor, toBurn);
        }
        emit Redeem(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral_usdc,
            order.collateral_usdt,
            usdcBack,
            usdtBack,
            toBurn
        );
    }

    /// @notice Disable an account from performing transactions
    /// @param account The account to be disabled
    function disableAccount(
        address account
    ) external onlyRole(CONTROLLER_ROLE) {
        blacklist[account] = true;
        emit DisableAccount(account);
    }

    /// @notice Enable an account from performing transactions
    /// @param account The account to be enabled
    function enableAccount(address account) external onlyRole(CONTROLLER_ROLE) {
        blacklist[account] = false;
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
