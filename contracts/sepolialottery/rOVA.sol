// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title rOVA
 * @notice OVA community rewards
 * @dev USDT tokens must be sent by the owner to this contract. The owner can add or remove addresses from the whitelist for each reward type.
 */
contract rOVA is Ownable, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    /// @notice Enumeration to identify reward types.
    enum Reward {
        usdt,
        rOva
    }

    /// @notice Emitted when an invalid (zero) address is provided.
    error InvalidAddress();

    /// @notice Emitted when a caller attempts to collect rewards but has nothing to claim.
    error NothingToCollect();

    /// @notice Emitted when the input lenght does not match.
    error InvalidInputLength();

    /// @notice USDT contract address on Ethereum mainnet.
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    /// @notice Mapping that tracks the allowed USDT claim amount for each whitelisted address.
    mapping(address => uint256) public allowedUsdt;

    /// @notice Mapping that tracks the allowed rOVA claim amount for each whitelisted address.
    mapping(address => uint256) public allowedROva;

    /// @notice Emitted when an address is added to a reward whitelist.
    event RewardWhitelisted(
        address indexed account,
        Reward reward,
        uint256 amount
    );

    /// @notice Emitted when an address is removed from a reward whitelist.
    event RewardRemoved(address indexed account, Reward reward);

    /// @notice Emitted when a reward is successfully collected.
    event RewardCollected(
        address indexed account,
        Reward reward,
        uint256 amount
    );

    /**
     * @notice Constructor that sets the initial administrator and initializes the rOVA ERC20 token.
     * @param admin The address of the contract administrator.
     */
    constructor(address admin) Ownable(admin) ERC20("rOVA", "rOVA") {}

    /**
     * @notice Allows the owner to recover any ERC20 tokens sent to the contract.
     * @param asset The address of the ERC20 token to recover.
     * @dev Transfers the entire balance of the specified token from the contract to the owner.
     */
    function recover(address asset) external onlyOwner {
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance > 0) {
            IERC20(asset).safeTransfer(msg.sender, balance);
        }
    }

    /**
     * @notice Adds an address to the whitelist for a specified reward.
     * @param who The address to be whitelisted.
     * @param reward The type of reward to whitelist for (usdt or rOva).
     * @param amount The reward amount to assign to the address.
     * @dev Reverts if the provided address is the zero address.
     */
    function add(
        address who,
        Reward reward,
        uint256 amount
    ) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        if (reward == Reward.usdt) {
            allowedUsdt[who] = amount;
            emit RewardWhitelisted(who, reward, amount);
        } else {
            allowedROva[who] = amount;
            emit RewardWhitelisted(who, reward, amount);
        }
    }

    /**
     * @notice Removes an address from the whitelist for a specified reward.
     * @param who The address to be removed.
     * @param reward The type of reward to remove from the whitelist (usdt or rOva).
     * @dev Reverts if the provided address is the zero address.
     */
    function remove(address who, Reward reward) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }
        if (reward == Reward.usdt) {
            allowedUsdt[who] = 0;
            emit RewardRemoved(who, reward);
        } else {
            allowedROva[who] = 0;
            emit RewardRemoved(who, reward);
        }
    }

    /**
     * @notice Batch adds multiple addresses to the whitelist for a specified reward.
     * @param accounts The array of addresses to be whitelisted.
     * @param amounts The array of reward amounts to assign to each address.
     * @param reward The type of reward to whitelist for (usdt or rOva).
     * @dev Reverts if any provided address is the zero address.
     */
    function batchAdd(
        address[] calldata accounts,
        uint256[] calldata amounts,
        Reward reward
    ) external onlyOwner {
        if (accounts.length != amounts.length) {
            revert InvalidInputLength();
        }
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) {
                revert InvalidAddress();
            }
            uint256 amount = amounts[i];
            if (reward == Reward.usdt) {
                allowedUsdt[accounts[i]] = amount;
            } else {
                allowedROva[accounts[i]] = amount;
            }
            emit RewardWhitelisted(accounts[i], reward, amount);
        }
    }

    /**
     * @notice Batch removes multiple addresses from the whitelist for a specified reward.
     * @param accounts The array of addresses to be removed.
     * @param reward The type of reward to remove from the whitelist (usdt or rOva).
     * @dev Reverts if any provided address is the zero address.
     */
    function batchRemove(
        address[] calldata accounts,
        Reward reward
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) {
                revert InvalidAddress();
            }
            if (reward == Reward.usdt) {
                allowedUsdt[accounts[i]] = 0;
            } else {
                allowedROva[accounts[i]] = 0;
            }
            emit RewardRemoved(accounts[i], reward);
        }
    }

    /**
     * @notice Allows a whitelisted address to collect their assigned rewards.
     * @dev Uses nonReentrant to prevent reentrancy attacks. Resets the allowed reward amounts to zero
     *      before transferring USDT or minting rOVA tokens. Reverts if the caller has no rewards to collect.
     */
    function collect() external nonReentrant {
        bool hasUsdt = allowedUsdt[msg.sender] > 0;
        bool hasROva = allowedROva[msg.sender] > 0;

        if (!hasUsdt && !hasROva) {
            revert NothingToCollect();
        }

        if (hasUsdt) {
            uint256 amount = allowedUsdt[msg.sender];
            // Reset allowedUsdt amount to prevent reentrancy issues.
            allowedUsdt[msg.sender] = 0;
            // Transfer USDT reward.
            IERC20(USDT).safeTransfer(msg.sender, amount);
            emit RewardCollected(msg.sender, Reward.usdt, amount);
        }
        if (hasROva) {
            uint256 amount = allowedROva[msg.sender];
            // Reset allowedROva amount to prevent reentrancy issues.
            allowedROva[msg.sender] = 0;
            // Mint rOVA reward.
            _mint(msg.sender, amount);
            emit RewardCollected(msg.sender, Reward.rOva, amount);
        }
    }
}
