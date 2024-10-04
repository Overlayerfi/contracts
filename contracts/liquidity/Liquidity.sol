// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ILiquidityDefs.sol";
import "./interfaces/IRewardAsset.sol";

/**
 * @notice Liquidity contract implementation.
 */
contract Liquidity is Ownable, ReentrancyGuard, ILiquidityDefs {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /**
     * @notice The pool info.
     */
    PoolInfo[] public poolInfo;

    /**
     * @notice The users info.
     */
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    /**
     * @notice The starting block for rewards.
     */
    uint256 public startBlock;

    /**
     * @notice The block amounts for each offered reward.
     */
    mapping(address => uint256) public rewardsPerBlock;

    /**
     * @notice Currently active reward.
     */
    mapping(address => bool) public activeRewards;

    /**
     * @notice The total allocation points for each reward.
     */
    mapping(address => uint256) public totalAllocPointsPerReward;

    /**
     * @notice The bonus multiplier for this chef.
     */
    uint256 public bonusMultiplier = 1;

    uint8 private constant NOT_ACTIVE = 0;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    /**
     * @notice Contract constructor.
     * @param admin The contract admin
     * @param startBlock_ The reward start block
     */
    constructor(address admin, uint256 startBlock_) Ownable(admin) {
        if (admin == address(0)) {
            revert InvalidZeroAddress();
        }
        startBlock = startBlock_;
    }

    /**
     * @notice Update the rewards starting block.
     * @param startBlock_ the new multiplier value.
     */
    function updateStartBlock(uint256 startBlock_) external onlyOwner {
        startBlock = startBlock_;
    }

    /**
     * @notice Update the multiplier value.
     * @param bonusMultiplier_ the new multiplier value.
     */
    function updateMultiplier(uint256 bonusMultiplier_) external onlyOwner {
        bonusMultiplier = bonusMultiplier_;
    }

    /**
     * @notice Set a reward rate.
     * @param rewardAsset the reward.
     * @param rewardRate the new reward rate.
     */
    function setReward(
        IERC20 rewardAsset,
        uint256 rewardRate
    ) external onlyOwner {
        if (!activeRewards[address(rewardAsset)]) {
            activeRewards[address(rewardAsset)] = true;
        }
        if (rewardsPerBlock[address(rewardAsset)] != rewardRate) {
            rewardsPerBlock[address(rewardAsset)] = rewardRate;
        }
    }

    /**
     * @notice Modify the allocation points for a pool.
     * @param pid the pool pid.
     * @param newPoints the new weight.
     * @return newTotal the new total allocation.
     */
    function setPoolAllocPoints(
        uint256 pid,
        uint256 newPoints,
        bool update
    ) external onlyOwner returns (uint256 newTotal) {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        if (update) {
            _massUpdatePools();
        }
        PoolInfo storage pool = poolInfo[pid];
        uint256 oldPoints = pool.allocPoints;
        pool.allocPoints = newPoints;
        if (oldPoints != newPoints) {
            totalAllocPointsPerReward[address(pool.rewardAsset)] =
                totalAllocPointsPerReward[address(pool.rewardAsset)] -
                (oldPoints) +
                (newPoints);
        }
        newTotal = totalAllocPointsPerReward[address(pool.rewardAsset)];
    }

    /**
     * @notice Deposit into the pool with harvest.
     * @param pid the pool identifier.
     * @param amount the amount to deposit.
     */
    function deposit(uint256 pid, uint256 amount) external nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];

        // Cache old values
        uint256 oldDebt = currentUser.rewardDebt;
        uint256 oldAmount = currentUser.amount;

        // update the pool up to date
        updatePool(pid);

        // Update user info
        currentUser.amount = currentUser.amount + amount;
        // update reward debt, there is harvest on deposit so at every deposit the debt will be updated with the new amount the user has.
        currentUser.rewardDebt = currentUser.amount.mulDiv(
            pool.accRewardPerShare,
            1e18
        );

        // harvest up to date rewards
        uint256 pending = oldAmount.mulDiv(
            pool.accRewardPerShare,
            1e18
        ) - oldDebt;
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        if (amount > 0) {
            pool.stakedAsset.safeTransferFrom(
                address(msg.sender),
                address(this),
                amount
            );
        }

        emit Deposit(msg.sender, pid, amount);
    }

    /**
     * @notice Withdraw from the pool with harvest.
     * @param pid the pool identifier.
     * @param amount the amount to withdraw.
     */
    function withdraw(uint256 pid, uint256 amount) external nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];
        if (amount > currentUser.amount) {
            revert InvalidAmount();
        }

        // update the pool up to date
        updatePool(pid);

        uint256 rewards = currentUser.amount.mulDiv(
            pool.accRewardPerShare,
            1e18
        );
        // Compute pending rewards
        uint256 pending = rewards - currentUser.rewardDebt;
        // Update user info
        currentUser.amount = currentUser.amount - amount;
        // update reward debt, there is harvest on deposit so at every deposit the debt will be updated with the new amount the user has.
        currentUser.rewardDebt = currentUser.amount.mulDiv(
            pool.accRewardPerShare,
            1e18
        );

        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        if (amount > 0) {
            _returnStakedTokens(pool.stakedAsset, address(msg.sender), amount);
        }

        emit Withdraw(msg.sender, pid, amount);
    }

    /**
     * @notice Harvest reward.
     * @param pid the pool identifier.
     */
    function harvest(uint256 pid) external nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo memory pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];

        // Compute pending rewards
        uint256 pending = pendingReward(pid, msg.sender);
        // update reward debt
        currentUser.rewardDebt = currentUser.rewardDebt + pending;

        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }

        emit Harvest(msg.sender, pid, pending);
    }

    /**
     * @notice Emergency withdraw all the deposited funds.
     * @param pid the pool identifier.
     */
    function emergencyWithdraw(uint256 pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage user = userInfo[pid][msg.sender];

        uint256 amount = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        if (amount > 0) {
            _returnStakedTokens(pool.stakedAsset, address(msg.sender), amount);
        }

        emit EmergencyWithdraw(msg.sender, pid, amount);
    }

    /**
     * @notice Get the pool lenght.
     * @return the lenght of the liquidity info.
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /**
     * @notice Get the total amount of tokens staked inside a pool.
     * @param pid the pool identifier.
     * @return the amount of token staked inside the given pool.
     */
    function getTotalStakedInPool(uint256 pid) external view returns (uint256) {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }
        return (poolInfo[pid].stakedAsset.balanceOf(address(this)));
    }

    /**
     * @notice Add a new pool.
     * @dev It reverts if the starting block is set to zero
     * @param stakedAsset the wanted lp token.
     * @param rewardAsset the reward that will be payed out.
     * @param allocationPoints the weight of the added pool.
     * @param update a boolean flag stating if update or not old pools.
     */
    function add(
        IERC20 stakedAsset,
        IERC20 rewardAsset,
        uint256 allocationPoints,
        bool update
    ) public onlyOwner {
        if (startBlock == NOT_ACTIVE) {
            revert LiquidityNotActive();
        }
        if (!activeRewards[address(rewardAsset)]) {
            revert InvactiveReward();
        }
        if (update) {
            _massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPointsPerReward[address(rewardAsset)] =
            totalAllocPointsPerReward[address(rewardAsset)] +
            (allocationPoints);
        poolInfo.push(
            PoolInfo({
                stakedAsset: stakedAsset,
                rewardAsset: rewardAsset,
                allocPoints: allocationPoints,
                lastRewardBlock: lastRewardBlock,
                accRewardPerShare: 0
            })
        );
    }

    /**
     * @notice Get the pending reward for a given pool and user.
     * @param pid the pool identifier.
     * @param user the participant.
     * @return the pending reward for given pool and user.
     */
    function pendingReward(
        uint256 pid,
        address user
    ) public view returns (uint256) {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        PoolInfo memory pool = poolInfo[pid];
        UserInfo memory currentUser = userInfo[pid][user];

        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 stakedAssetSupply = pool.stakedAsset.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && stakedAssetSupply != 0) {
            uint256 multiplier = _getMultiplier(
                pool.lastRewardBlock,
                block.number
            );

            // This is the same computation made in the updatePool function. Just a view version.
            uint256 rewards = multiplier *
                (
                    rewardsPerBlock[address(pool.rewardAsset)].mulDiv(
                        pool.allocPoints,
                        totalAllocPointsPerReward[address(pool.rewardAsset)]
                    )
                );
            accRewardPerShare =
                accRewardPerShare +
                rewards.mulDiv(1e18, stakedAssetSupply);

            return
                currentUser.amount.mulDiv(accRewardPerShare, 1e18) -
                currentUser.rewardDebt;
        } else {
            return 0;
        }
    }

    /**
     * @notice Update all the pools.
     */
    function _massUpdatePools() internal {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    /**
     * @notice Pay the reward.
     * @dev The reward asset is directly minted from the reward token
     * @param rewardAsset the reward token.
     * @param to the reward receiver.
     * @param amount the amount to be payed.
     */
    function _payReward(
        IERC20 rewardAsset,
        address to,
        uint256 amount
    ) internal {
        IRewardAsset(address(rewardAsset)).mint(to, amount);
    }

    /**
     * @notice Return the staked tokens.
     * @param token the staked token.
     * @param to the reward receiver.
     * @param amount the amount to be returned.
     */
    function _returnStakedTokens(
        IERC20 token,
        address to,
        uint256 amount
    ) internal {
        token.safeTransfer(to, amount);
    }

    /**
     * @notice Update pool infos.
     * @param pid the pool identifier.
     */
    function updatePool(uint256 pid) internal {
        PoolInfo storage pool = poolInfo[pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 stakedAssetSupply = pool.stakedAsset.balanceOf(address(this));
        if (stakedAssetSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
        uint256 rewards = multiplier *
            (
                rewardsPerBlock[address(pool.rewardAsset)].mulDiv(
                    pool.allocPoints,
                    totalAllocPointsPerReward[address(pool.rewardAsset)]
                )
            );
        pool.accRewardPerShare =
            pool.accRewardPerShare +
            rewards.mulDiv(1e18, stakedAssetSupply);

        pool.lastRewardBlock = block.number;
    }

    /**
     * @notice Get the multiplier value calculated between two blocks.
     * @param from the starting block.
     * @param to the ending block.
     * @return The difference between the two sides multiplied for the bonus.
     */
    function _getMultiplier(
        uint256 from,
        uint256 to
    ) internal view returns (uint256) {
        // Sould never happen.
        if (to < from) {
            return bonusMultiplier;
        }

        uint256 delta = to - from;
        if (delta == 0) {
            return bonusMultiplier;
        }
        return delta * bonusMultiplier;
    }
}
