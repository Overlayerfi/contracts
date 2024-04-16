// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./MintRedeemManager.sol";
import "./interfaces/IUSDxMDefs.sol";

/**
 * @title USDxM
 * @notice USDxM The starting point...
 */
contract USDxM is ERC20Burnable, ERC20Permit, IUSDxMDefs, MintRedeemManager {
  constructor(
    address admin,
    StableCoin memory _usdc,
    StableCoin memory _usdt,
    address _newAssetDestinationWallet,
    address _admin,
    uint256 _parentDecimals,
    uint256 _maxMintPerBlock,
    uint256 _maxRedeemPerBlock
  )
    ERC20("USDx", "USDx")
    ERC20Permit("USDx")
    MintRedeemManager(
      _usdc,
      _usdt,
      _newAssetDestinationWallet,
      _admin,
      _parentDecimals,
      _maxMintPerBlock,
      _maxRedeemPerBlock
    ) {
    if (admin == address(0)) revert ZeroAddressException();
  }

	/// @notice Mint tokens
  /// @param order A struct containing the mint order
  function mint(Order calldata order) external nonReentrant {
    mintInternal(order);
    _mint(order.beneficiary, order.usdx_amount);
    emit Mint(
      msg.sender,
      order.benefactor,
      order.beneficiary,
      order.collateral_usdc,
      order.collateral_usdt,
      order.collateral_usdc_amount,
      order.collateral_usdt_amount,
      order.usdx_amount
    );
  }

	/// @notice Redeem collateral
  /// @param order A struct containing the mint order
  function redeem(Order calldata order) external nonReentrant {
    redeemInternal(order);
    if (msg.sender == order.benefactor) {
      _burn(msg.sender, order.usdx_amount);
    } else {
      burnFrom(order.benefactor, order.usdx_amount);
    }
    emit Redeem(
      msg.sender,
      order.benefactor,
      order.beneficiary,
      order.collateral_usdc,
      order.collateral_usdt,
      order.collateral_usdc_amount,
      order.collateral_usdt_amount,
      order.usdx_amount
    );
  }
}