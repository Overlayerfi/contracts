// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OvaSepoliaFaucet
/// @notice A simple faucet contract for dispensing testnet USDT and OverlayerWrap LP tokens on Sepolia.
/// @dev Tokens must be funded into this contract by the owner in advance. Rate-limited to one request every 10 minutes per address.
contract OvaSepoliaFaucet is Ownable {
    using SafeERC20 for IERC20;

    /// @notice ERC20 token instance for USDT (assumed 6 decimals).
    IERC20 public tokenUSDT;

    /// @notice ERC20 token instance for OverlayerWrap-USDT LP token (assumed 18 decimals).
    IERC20 public tokenOverlayerWrapUsdtLp;

    // Constants for token amounts:
    // For tokens with 6 decimals (USDT): 10 * 10^6 = 10 USDT
    uint256 private constant SIX_DECIMAL_AMOUNT = 10 * (10 ** 6);
    // For tokens with 18 decimals (LP token): 10 * 10^18 = 10 LP tokens
    uint256 private constant EIGHTEEN_DECIMAL_AMOUNT = 10 * (10 ** 18);

    /// @notice Stores the timestamp of the last faucet request per address.
    mapping(address => uint256) public lastRequestTimestamp;

    /// @notice Cooldown period between requests by the same address.
    uint256 private constant REQUEST_DELAY = 10 minutes;

    /// @notice Initializes the faucet with token addresses and sets the owner.
    /// @param tokenUSDT_ The address of the USDT token contract.
    /// @param tokenOverlayerWrapUsdtLp_ The address of the OverlayerWrap-USDT LP token contract.
    constructor(
        address tokenUSDT_,
        address tokenOverlayerWrapUsdtLp_
    ) Ownable(msg.sender) {
        tokenUSDT = IERC20(tokenUSDT_);
        tokenOverlayerWrapUsdtLp = IERC20(tokenOverlayerWrapUsdtLp_);
    }

    /// @notice Dispenses 10 USDT and 10 OverlayerWrap LP tokens to the recipient.
    /// @dev Each address can only request once every 10 minutes.
    /// @param recipient The address to receive the test tokens.
    function faucet(address recipient) external {
        require(
            recipient != address(0),
            "SepoliaFaucet: invalid recipient address"
        );
        require(
            block.timestamp - lastRequestTimestamp[recipient] >= REQUEST_DELAY,
            "SepoliaFaucet: request too soon"
        );

        lastRequestTimestamp[recipient] = block.timestamp;

        // Transfer 10 USDT (6 decimals)
        tokenUSDT.safeTransfer(recipient, SIX_DECIMAL_AMOUNT);

        // Transfer 10 OverlayerWrap LP tokens (18 decimals)
        tokenOverlayerWrapUsdtLp.safeTransfer(recipient, EIGHTEEN_DECIMAL_AMOUNT);
    }
}
