// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OvaUsdtDistributor
 * @notice Distributes a fixed reward of 50 USDT to whitelisted addresses.
 * @dev USDT tokens must be sent by the owner to this contract. The owner can add or remove
 * addresses from the whitelist. Each whitelisted address can collect a fixed reward only once.
 */
contract OvaUsdtDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Emitted when an invalid (zero) address is used.
    error InvalidAddress();

    /// @notice Emitted when a caller attempts to collect rewards but has nothing to claim.
    error NothingToCollect();

    /// @notice The fixed reward amount of 50 USDT (with 6 decimals).
    uint256 public constant AMOUNT = 50 * (10 ** 6);

    /// @notice USDT contract address on Ethereum mainnet.
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    /// @notice Mapping that tracks the allowed claim amount for each whitelisted address.
    mapping(address => uint256) public allowed;

    /**
     * @notice Constructor that sets the initial administrator.
     * @param admin The address of the contract administrator.
     */
    constructor(address admin) Ownable(admin) {}

    /**
     * @notice Allows the owner to recover any ERC20 tokens sent to the contract.
     * @param asset The address of the ERC20 token to recover.
     * @dev Transfers the entire balance of the token from the contract to the owner.
     */
    function recover(address asset) external onlyOwner {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset).safeTransfer(msg.sender, balance);
        }
    }

    /**
     * @notice Adds an address to the whitelist with a fixed reward.
     * @param who The address to be whitelisted.
     * @dev Reverts if the provided address is the zero address.
     */
    function add(address who) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        allowed[who] = AMOUNT;
    }

    /**
     * @notice Removes an address from the whitelist.
     * @param who The address to be removed.
     * @dev Reverts if the provided address is the zero address.
     */
    function remove(address who) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        allowed[who] = 0;
    }

    /**
     * @notice Allows a whitelisted address to collect their USDT reward.
     * @dev Uses nonReentrant to prevent reentrancy attacks. Resets the allowed amount to zero
     * before transferring tokens. Reverts if the caller is not whitelisted or has already claimed.
     */
    function collect() external nonReentrant {
        if (allowed[msg.sender] == 0) {
            revert NothingToCollect();
        }
        // Reset allowed amount to prevent reentrancy issues.
        allowed[msg.sender] = 0;
        // Transfer the fixed reward to the caller.
        IERC20(USDT).safeTransfer(msg.sender, AMOUNT);
    }
}
