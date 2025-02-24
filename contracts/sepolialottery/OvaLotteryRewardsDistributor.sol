// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title OvaLotteryRewardsDistributor
 * @notice Distributes a fixed reward of 50 USDT to whitelisted addresses.
 * @dev USDT tokens must be sent by the owner to this contract. The owner can add or remove
 * addresses from the whitelist. Each whitelisted address can collect a fixed reward only once.
 */
contract OvaLotteryRewardsDistributor is Ownable, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    enum Reward {
        usdt,
        rOva
    }

    /// @notice Emitted when an invalid (zero) address is used.
    error InvalidAddress();

    /// @notice Emitted when a caller attempts to collect rewards but has nothing to claim.
    error NothingToCollect();

    /// @notice The fixed reward amount of 50 USDT (with 6 decimals).
    uint256 public constant AMOUNT_USDT = 50 * (10 ** 6);

    uint256 public constant AMOUNT_rOVA = 50 * (10 ** 18);

    /// @notice USDT contract address on Ethereum mainnet.
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    /// @notice Mapping that tracks the allowedUsdt claim amount for each whitelisted address.
    mapping(address => uint256) public allowedUsdt;

    mapping(address => uint256) public allowedROva;

    /**
     * @notice Constructor that sets the initial administrator.
     * @param admin The address of the contract administrator.
     */
    constructor(address admin) Ownable(admin) ERC20("rOVA", "rOVA") {}

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
    function add(address who, Reward reward) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        if (reward == Reward.usdt) {
            allowedUsdt[who] = AMOUNT_USDT;
        } else {
            allowedROva[who] = AMOUNT_rOVA;
        }
    }

    /**
     * @notice Removes an address from the whitelist.
     * @param who The address to be removed.
     * @dev Reverts if the provided address is the zero address.
     */
    function remove(address who, Reward reward) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        if (reward == Reward.usdt) {
            allowedUsdt[who] = 0;
        } else {
            allowedROva[who] = 0;
        }
    }

    /**
     * @notice Allows a whitelisted address to collect their USDT reward.
     * @dev Uses nonReentrant to prevent reentrancy attacks. Resets the allowedUsdt amount to zero
     * before transferring tokens. Reverts if the caller is not whitelisted or has already claimed.
     */
    function collect() external nonReentrant {
        if (allowedUsdt[msg.sender] == 0 && allowedROva[msg.sender] == 0) {
            revert NothingToCollect();
        }
        if (allowedUsdt[msg.sender] > 0) {
            // Reset allowedUsdt amount to prevent reentrancy issues.
            allowedUsdt[msg.sender] = 0;
            // Transfer the fixed reward to the caller.
            IERC20(USDT).safeTransfer(msg.sender, AMOUNT_USDT);
        }
        if (allowedROva[msg.sender] > 0) {
            allowedROva[msg.sender] = 0;
            _mint(msg.sender, AMOUNT_rOVA);
        }
    }
}
