// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SepoliaFaucet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public tokenUSDC;
    IERC20 public tokenUSDT;
    IERC20 public tokenUSDOUSDC;
    IERC20 public tokenUSDOUSDT;

    // Constants for token amounts based on decimals:
    // For tokens with 6 decimals: 10 * 10^6
    uint256 private constant SIX_DECIMAL_AMOUNT = 10 * 10 ** 6;
    // For tokens with 18 decimals: 10 * 10^18
    uint256 private constant EIGHTEEN_DECIMAL_AMOUNT = 10 * 10 ** 18;

    // Constructor sets the token addresses and the owner of the contract
    constructor(
        address _tokenUSDC,
        address _tokenUSDT,
        address _tokenUSDOUSDC,
        address _tokenUSDOUSDT
    ) Ownable(msg.sender) {
        tokenUSDC = IERC20(_tokenUSDC);
        tokenUSDT = IERC20(_tokenUSDT);
        tokenUSDOUSDC = IERC20(_tokenUSDOUSDC);
        tokenUSDOUSDT = IERC20(_tokenUSDOUSDT);
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

        tokenUSDOUSDT.safeTransfer(recipient, EIGHTEEN_DECIMAL_AMOUNT);
        tokenUSDOUSDC.safeTransfer(recipient, EIGHTEEN_DECIMAL_AMOUNT);
    }
}
