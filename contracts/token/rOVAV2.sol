// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title rOVAV2
 * @notice OVA community rewards
 */
contract rOVAV2 is Ownable, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    /// @notice Emitted when an invalid (zero) address is provided.
    error InvalidAddress();

    /// @notice Emitted when trying to perform a not valid operation.
    error OperationNotAllowed();

    /// @notice Emitted when a caller attempts to collect rewards but has nothing to claim.
    error NothingToCollect();

    /// @notice Emitted when the input lenght does not match.
    error InvalidInputLength();

    /// @notice Mapping that tracks the allowed rOVAV2 claim amount for each whitelisted address.
    mapping(address => uint256) public allowedROva;

    /// @notice Emitted when an address is added to a reward whitelist.
    event RewardWhitelisted(address indexed account, uint256 amount);

    /// @notice Emitted when an address is removed from a reward whitelist.
    event RewardRemoved(address indexed account);

    /// @notice Emitted when a reward is successfully collected.
    event RewardCollected(address indexed account, uint256 amount);

    /// @notice Opens the public collection
    bool public collectionStarted;

    /**
     * @notice Constructor that sets the initial administrator and initializes the rOVAV2 ERC20 token.
     * @param admin The address of the contract administrator.
     */
    constructor(address admin) Ownable(admin) ERC20("rOVAV2", "rOVAV2") {}

    /**
     * @notice Allows the owner start the token collection.
     */
    function setCollection() external onlyOwner {
        collectionStarted = true;
    }

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
     * @param amount The reward amount to assign to the address.
     * @dev Reverts if the provided address is the zero address.
     */
    function add(address who, uint256 amount) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }

        allowedROva[who] = amount;
        emit RewardWhitelisted(who, amount);
    }

    /**
     * @notice Removes an address from the whitelist for a specified reward.
     * @param who The address to be removed.
     * @dev Reverts if the provided address is the zero address.
     */
    function remove(address who) external onlyOwner {
        if (who == address(0)) {
            revert InvalidAddress();
        }

        allowedROva[who] = 0;
        emit RewardRemoved(who);
    }

    /**
     * @notice Batch adds multiple addresses to the whitelist for a specified reward.
     * @param accounts The array of addresses to be whitelisted.
     * @param amounts The array of reward amounts to assign to each address.
     * @dev Reverts if any provided address is the zero address.
     */
    function batchAdd(
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external onlyOwner {
        if (accounts.length != amounts.length) {
            revert InvalidInputLength();
        }
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) {
                revert InvalidAddress();
            }
            uint256 amount = amounts[i];

            allowedROva[accounts[i]] = amount;
            emit RewardWhitelisted(accounts[i], amount);
        }
    }

    /**
     * @notice Batch removes multiple addresses from the whitelist for a specified reward.
     * @param accounts The array of addresses to be removed.
     * @dev Reverts if any provided address is the zero address.
     */
    function batchRemove(address[] calldata accounts) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (accounts[i] == address(0)) {
                revert InvalidAddress();
            }
            allowedROva[accounts[i]] = 0;
            emit RewardRemoved(accounts[i]);
        }
    }

    /**
     * @notice Allows a whitelisted address to collect their assigned rewards.
     * @dev Uses nonReentrant to prevent reentrancy attacks. Resets the allowed reward amounts to zero
     *      before transferring USDT or minting rOVAV2 tokens. Reverts if the caller has no rewards to collect.
     */
    function collect() external nonReentrant {
        if (collectionStarted == false) {
            revert OperationNotAllowed();
        }
        uint256 amount = allowedROva[msg.sender];

        if (amount == 0) {
            revert NothingToCollect();
        }

        // Reset allowedROva amount to prevent reentrancy issues.
        allowedROva[msg.sender] = 0;
        // Mint rOVAV2 reward.
        _mint(msg.sender, amount);
        emit RewardCollected(msg.sender, amount);
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
    ) internal override {
        if (from != address(0)) {
            revert OperationNotAllowed();
        }
        super._update(from, to, value);
    }
}
