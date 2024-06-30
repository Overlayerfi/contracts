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
    constructor(
        address admin,
        MintRedeemManagerTypes.StableCoin memory usdc,
        MintRedeemManagerTypes.StableCoin memory usdt,
        uint256 maxMintPerBlock,
        uint256 maxRedeemPerBlock
    )
        ERC20("USDO", "USDO")
        ERC20Permit("USDO")
        MintRedeemManager(
            usdc,
            usdt,
            admin,
            decimals(),
            maxMintPerBlock,
            maxRedeemPerBlock
        )
    {
        if (admin == address(0)) revert USDOZeroAddressException();
        if (decimals() < usdc.decimals || decimals() < usdt.decimals) {
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
        mintInternal(order);
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
        (uint256 toBurn, uint256 usdcBack, uint256 usdtBack) = redeemInternal(
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
}
