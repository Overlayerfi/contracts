// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ILiquidityDefs {
    /**
     * @notice Info on each user.
     */
    struct UserInfo {
        uint256 amount; // How many tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        /**
         * @notice The strategy used by the vault.
         *
         * We do some fancy math here. Basically, any point in time, the amount of REWARD
         * entitled to a user but is pending to be distributed is:
         *
         *  pending reward = (user.amount * pool.accRewardPerShare)
         *
         * Whenever a user deposits or withdraws tokens to a pool. Here's what happens:
         *  1. The pool's `accRewardPerShare` (and `lastRewardBlock`) gets updated.
         *  2. User receives the pending reward sent to his/her address.
         *  3. User's `amount` gets updated.
         */
    }

    /**
     * @notice Info on each pool.
     */
    struct PoolInfo {
        IERC20 stakedAsset; // Address of staked token contract.
        IERC20 rewardAsset; // REward token.
        uint256 allocPoints; // Pool weight
        uint256 lastRewardBlock; // Last block number that REWARD distribution occurs.
        uint256 accRewardPerShare; // Accumulated REWARD per share, times 1e12. See below.
    }

    error InvalidAmount();

    error InvalidPid();

    error InvalidZeroAddress();

    error InvactiveReward();

    error LiquidityNotActive();

    function deposit(uint256 pid, uint256 amount) external;

    function withdraw(uint256 pid, uint256 amount) external;

    function harvest(uint256 pid) external;

    function pendingReward(
        uint256 pid,
        address _user
    ) external view returns (uint256);

    function userInfo(
        uint256 pid,
        address _user
    ) external view returns (uint256, uint256);

    function emergencyWithdraw(uint256 pid) external;
}
