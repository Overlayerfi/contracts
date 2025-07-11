// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SepoliaFaucet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public tokenUSDC;
    IERC20 public tokenUSDT;
    IERC20 public tokenOverlayerWrapUSDC;
    IERC20 public tokenOverlayerWrapUSDT;

    // Constants for token amounts based on decimals:
    // For tokens with 6 decimals: 10 * 10^6
    uint256 private constant SIX_DECIMAL_AMOUNT = 10 * 10 ** 6;
    // For tokens with 18 decimals: 10 * 10^18
    uint256 private constant EIGHTEEN_DECIMAL_AMOUNT = 10 * 10 ** 18;

    // Constructor sets the token addresses and the owner of the contract
    constructor(
        address _tokenUSDC,
        address _tokenUSDT,
        address _tokenOverlayerWrapUSDC,
        address _tokenOverlayerWrapUSDT
    ) Ownable(msg.sender) {
        tokenUSDC = IERC20(_tokenUSDC);
        tokenUSDT = IERC20(_tokenUSDT);
        tokenOverlayerWrapUSDC = IERC20(_tokenOverlayerWrapUSDC);
        tokenOverlayerWrapUSDT = IERC20(_tokenOverlayerWrapUSDT);
    }

    /// @notice Only the owner can call this faucet function.
    /// @param recipient The address to receive 10 tokens of each type.
    function faucet(address recipient) external onlyOwner {
        require(
            recipient != address(0),
            "SepoliaFaucet: invalid recipient address"
        );
        tokenUSDC.safeTransfer(recipient, SIX_DECIMAL_AMOUNT);
        tokenUSDT.safeTransfer(recipient, SIX_DECIMAL_AMOUNT);

        tokenOverlayerWrapUSDT.safeTransfer(recipient, EIGHTEEN_DECIMAL_AMOUNT);
        tokenOverlayerWrapUSDC.safeTransfer(recipient, EIGHTEEN_DECIMAL_AMOUNT);
    }
}
