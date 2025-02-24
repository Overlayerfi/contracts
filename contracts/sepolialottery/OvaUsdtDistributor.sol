// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract OvaUsdtDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();

    error NothingToCollect();

    /// @notice 50 USDT (6 decimals)
    uint256 public constant AMOUNT = 50 * (10 ** 6);

    /// @notice USDT eth mainnet address
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    mapping(address => uint256) public allowed;

    constructor(address admin) Ownable(admin) {}

    function recover(address asset) external onlyOwner {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset).safeTransfer(msg.sender, balance);
        }
    }

    function add(address who) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        allowed[who] = AMOUNT;
    }

    function remove(address who) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        allowed[who] = 0;
    }

    function collect() external nonReentrant {
        if (allowed[msg.sender] == 0) {
            revert NothingToCollect();
        }
        allowed[msg.sender] = 0;
        IERC20(USDT).safeTransfer(msg.sender, AMOUNT);
    }
}
