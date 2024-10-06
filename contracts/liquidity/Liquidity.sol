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
     * @notice The starting time for rewards.
     */
    uint256 public startTime;

    /**
     * @notice The emitted amount of reward for each second.
     */
    mapping(address => uint256) public rewardsPerSecond;

    /**
     * @notice Currently active reward.
     */
    mapping(address => bool) public activeRewards;

    /**
     * @notice The total allocation points for each reward.
     */
    mapping(address => uint256) public totalAllocPointsPerReward;

    /**
     * @notice The bonus multiplier.
     */
    uint256 public bonusMultiplier = 1;

    /**
     * @notice A disabled flag.
     */
    uint8 private constant NOT_ACTIVE = 0;

    /**
     * @notice Referral bonus percentage.
     */
    uint8 public referralBonus = 5;

    /**
     * @notice Referral contract.
     */
    IOvaReferral public referral;

    /**
     * @notice Contract constructor.
     * @param admin The contract admin
     * @param startTime_ The reward start time
     */
    constructor(address admin, uint256 startTime_) Ownable(admin) {
        if (admin == address(0)) {
            revert InvalidZeroAddress();
        }
        startTime = startTime_;
    }

    /**
     * @notice Update the rewards starting time.
     * @param startTime_ the new start time.
     */
    function updateStartTime(uint256 startTime_) external onlyOwner {
        startTime = startTime_;
    }

    /**
     * @notice Update the referral bonus amount.
     * @dev It can not be over 100 (100%).
     * @param referralBonus_ the bonus amount.
     */
    function updateReferralBonus(uint8 referralBonus_) external onlyOwner {
        if (referralBonus_ <= 100) {
            referralBonus = referralBonus_;
            emit NewReferralBonus(referralBonus_);
        }
    }

    /**
     * @notice Update the referral contract.
     * @param referral_ the bonus amount.
     */
    function updateReferral(IOvaReferral referral_) external onlyOwner {
        referral = referral_;
        emit NewReferral(referral_);
    }

    /**
     * @notice Update the multiplier value.
     * @param bonusMultiplier_ the new multiplier value.
     */
    function updateMultiplier(uint256 bonusMultiplier_) external onlyOwner {
        bonusMultiplier = bonusMultiplier_;
        emit NewBonusMultiplier(bonusMultiplier_);
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
        if (rewardsPerSecond[address(rewardAsset)] != rewardRate) {
            rewardsPerSecond[address(rewardAsset)] = rewardRate;
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
     * @notice Deposit into the pool with harvest by consuming a referral.
     * @dev The referral must be consumed after the deposit otherwise the referral source will also gain past performances.
     * @param pid the pool identifier.
     * @param amount the amount to deposit.
     * @param referralSource the referral source user
     */
    function depositWithReferral(
        uint256 pid,
        uint256 amount,
        address referralSource
    ) external {
        deposit(pid, amount);

        referral.consumeReferral(referralSource, msg.sender);
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
        //harvest accued rewards
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        // harvest referral bonus and track gained point from the referral source
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset);
        }
        //return stating funds
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

        // pay rewards
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        // pay bonus rewards
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset);
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
     * @notice Deposit into the pool with harvest.
     * @param pid the pool identifier.
     * @param amount the amount to deposit.
     */
    function deposit(uint256 pid, uint256 amount) public nonReentrant {
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
        uint256 pending = oldAmount.mulDiv(pool.accRewardPerShare, 1e18) -
            oldDebt;
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }

        // harvest referral bonus and track gained point from the referral source
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset);
        }

        // collect collateral
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
     * @notice Add a new pool.
     * @dev It reverts if the starting time is set to zero
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
        if (startTime == NOT_ACTIVE) {
            revert LiquidityNotActive();
        }
        if (!activeRewards[address(rewardAsset)]) {
            revert InvactiveReward();
        }
        if (update) {
            _massUpdatePools();
        }
        uint256 lastRewardTime = block.timestamp > startTime
            ? block.timestamp
            : startTime;
        totalAllocPointsPerReward[address(rewardAsset)] =
            totalAllocPointsPerReward[address(rewardAsset)] +
            (allocationPoints);
        poolInfo.push(
            PoolInfo({
                stakedAsset: stakedAsset,
                rewardAsset: rewardAsset,
                allocPoints: allocationPoints,
                lastRewardTime: lastRewardTime,
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
        if (block.timestamp > pool.lastRewardTime && stakedAssetSupply != 0) {
            uint256 multiplier = _getMultiplier(
                pool.lastRewardTime,
                block.timestamp
            );

            // This is the same computation made in the updatePool function. Just a view version.
            uint256 rewards = multiplier *
                (
                    rewardsPerSecond[address(pool.rewardAsset)].mulDiv(
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
     * @notice Pay bonus referral tokens
     * @param originalAmount the original amount.
     */
    function _payBonus(uint256 originalAmount, IERC20 asset) internal {
        uint256 bonus = originalAmount.mulDiv(referralBonus, 100);
        address recipient = referral.referredFrom(msg.sender);
        if (bonus > 0 && recipient != address(0)) {
            _payReward(asset, recipient, bonus);
            referral.track(recipient, bonus);
        }
    }

    /**
     * @notice Update pool infos.
     * @param pid the pool identifier.
     */
    function updatePool(uint256 pid) internal {
        PoolInfo storage pool = poolInfo[pid];
        if (block.timestamp <= pool.lastRewardTime) {
            return;
        }
        uint256 stakedAssetSupply = pool.stakedAsset.balanceOf(address(this));
        if (stakedAssetSupply == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        uint256 multiplier = _getMultiplier(
            pool.lastRewardTime,
            block.timestamp
        );
        uint256 rewards = multiplier *
            (
                rewardsPerSecond[address(pool.rewardAsset)].mulDiv(
                    pool.allocPoints,
                    totalAllocPointsPerReward[address(pool.rewardAsset)]
                )
            );
        pool.accRewardPerShare =
            pool.accRewardPerShare +
            rewards.mulDiv(1e18, stakedAssetSupply);

        pool.lastRewardTime = block.timestamp;
    }

    /**
     * @notice Get the multiplier value calculated between two times.
     * @param from the starting time.
     * @param to the ending time.
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
