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
     * @notice The staking assets already present.
     */
    mapping(address => bool) private usedStakingAssets;

    /**
     * @notice The bonus multiplier.
     */
    uint256 public bonusMultiplier = 1;

    /**
     * @notice Referral bonus percentage.
     * @dev 5%
     */
    uint8 public referralBonus = 5;

    /**
     * @notice Referral bonus percentage.
     * @dev 2.5%
     */
    uint16 public selfReferralBonus = 25;

    /**
     * @notice Referral contract.
     */
    IOvaReferral public referral;

    /**
     * @notice Contract constructor.
     * @param admin The contract admin
     */
    constructor(address admin) Ownable(admin) {
        if (admin == address(0)) {
            revert InvalidZeroAddress();
        }
        startTime = block.timestamp;
    }

    /**
     * @notice Update the rewards starting time.
     * @param startTime_ the new start time.
     */
    function updateStartTime(uint256 startTime_) external onlyOwner {
        if (startTime_ < block.timestamp) {
            revert InvalidAmount();
        }
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
     * @notice Update the referral bonus amount.
     * @dev It can not be over 1000 (100%).
     * @param selfReferralBonus_ the bonus amount.
     */
    function updateSelfReferralBonus(
        uint16 selfReferralBonus_
    ) external onlyOwner {
        if (selfReferralBonus_ <= 1000) {
            selfReferralBonus = selfReferralBonus_;
            emit NewSelfReferralBonus(selfReferralBonus_);
        }
    }

    /**
     * @notice Update the referral contract.
     * @param referral_ the referral contract.
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

    /**
     * @notice Withdraw from the pool with harvest.
     * @param pid the pool identifier.
     * @param amount the amount to withdraw.
     */
    function withdraw(
        uint256 pid,
        uint256 amount
    ) external override nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];
        if (amount > currentUser.amount) {
            revert InvalidAmount();
        }
        // Vesting pool
        if (pool.vesting && block.timestamp < pool.endTimeStamp) {
            revert VestingPool();
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
        // update reward debt, there is harvest on withdraw so at every withdraw the debt will be updated with the new amount the user has.
        currentUser.rewardDebt = currentUser.amount.mulDiv(
            pool.accRewardPerShare,
            1e18
        );
        //harvest accrued rewards
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        // harvest referral bonus and track gained point from the referral source
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset, msg.sender);
        }
        //return stating funds
        if (amount > 0) {
            _returnStakedTokens(pool.stakedAsset, address(msg.sender), amount);
        }

        emit Withdraw(msg.sender, pid, amount);
    }

    /**
     * @notice Harvest reward for an account.
     * @param pid the pool identifier.
     * @param target the user to be harvested.
     */
    function harvestFor(
        uint256 pid,
        address target
    ) external override nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo memory pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][target];
        // Vesting pool
        if (pool.vesting && block.timestamp < pool.endTimeStamp) {
            revert VestingPool();
        }

        // Compute pending rewards
        uint256 pending = pendingReward(pid, target);
        // Update reward debt
        currentUser.rewardDebt = currentUser.rewardDebt + pending;

        // Pay rewards
        if (pending > 0) {
            _payReward(pool.rewardAsset, target, pending);
        }
        // Pay bonus rewards
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset, target);
        }

        emit Harvest(target, pid, pending);
    }

    /**
     * @notice Harvest reward.
     * @param pid the pool identifier.
     */
    function harvest(uint256 pid) external override nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        // Get pool and user
        PoolInfo memory pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];
        // Vesting pool
        if (pool.vesting && block.timestamp < pool.endTimeStamp) {
            revert VestingPool();
        }

        // Compute pending rewards
        uint256 pending = pendingReward(pid, msg.sender);
        // Update reward debt
        currentUser.rewardDebt = currentUser.rewardDebt + pending;

        // Pay rewards
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }
        // Pay bonus rewards
        if (address(referral) != address(0)) {
            _payBonus(pending, pool.rewardAsset, msg.sender);
        }

        emit Harvest(msg.sender, pid, pending);
    }

    /**
     * @notice Emergency withdraw all the deposited funds.
     * @param pid the pool identifier.
     */
    function emergencyWithdraw(uint256 pid) external override nonReentrant {
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
    function poolLength() external view override returns (uint256) {
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
    function deposit(uint256 pid, uint256 amount) public override nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][msg.sender];

        if (pool.endTimeStamp > 0 && pool.endTimeStamp < block.timestamp) {
            revert PoolNotActive();
        }

        // Cache old values
        uint256 oldDebt = currentUser.rewardDebt;
        uint256 oldAmount = currentUser.amount;

        // update the pool up to date
        updatePool(pid);

        // Update user info
        currentUser.amount = currentUser.amount + amount;

        // If not vesting pool, harvest now. Else harvest at the end of the vesting period (endTimestamp). If it's the second case
        // harvest here is unlikely to happen as user is not allowed to deposit after the endTimestamp
        if (
            !pool.vesting ||
            (pool.vesting && pool.endTimeStamp < block.timestamp)
        ) {
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
                _payBonus(pending, pool.rewardAsset, msg.sender);
            }
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
     * @notice Add a new pool
     * @dev It reverts if the starting time is set to zero
     * @dev A vesting pool can not have endTime equal to 0
     * @param stakedAsset the wanted token.
     * @param rewardAsset the reward that will be payed out.
     * @param allocationPoints the weight of the added pool.
     * @param endTime the ending time for this pool. 0 to ignore.
     * @param vested a boolean flag stating if harvest and withdraw have to wait for the end of the pool.
     * @param update a boolean flag stating if update or not old pools.
     */
    function add(
        IERC20 stakedAsset,
        IERC20 rewardAsset,
        uint256 allocationPoints,
        uint256 endTime,
        bool vested,
        bool update
    ) public onlyOwner {
        if (usedStakingAssets[address(stakedAsset)]) {
            revert AlreadyUsedStakedAsset();
        }
        if (vested && endTime == 0) {
            revert NotAllowed();
        }
        if (!activeRewards[address(rewardAsset)]) {
            revert InvactiveReward();
        }
        if (update) {
            _massUpdatePools();
        }

        usedStakingAssets[address(stakedAsset)] = true;

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
                accRewardPerShare: 0,
                endTimeStamp: endTime,
                vesting: vested
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
    ) public view virtual override returns (uint256) {
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

            uint256 pending = currentUser.amount.mulDiv(
                accRewardPerShare,
                1e18
            ) - currentUser.rewardDebt;
            return pending;
        } else {
            return 0;
        }
    }

    /**
     * @notice Retrieve all the pending rewards under a given referral code.
     * @param code The referral code
     * @param pid The pool id
     * @param startIndex The start referred array index to query from
     * @param endIndex The end referred array index to query from
     * @return The total pending rewards
     */
    function pendingRewardsReferral(
        string memory code,
        uint256 pid,
        uint256 startIndex,
        uint256 endIndex
    ) public view returns (uint256) {
        if (address(referral) == address(0)) {
            return 0;
        }
        address refSource = referral.referralCodes(code);
        address[] memory referredUsers = referral.seeReferred(refSource);
        if (startIndex == 0 && endIndex == 0) {
            endIndex = referredUsers.length;
        }

        uint256 total = 0;
        for (uint256 i = startIndex; i < endIndex; ++i) {
            total += pendingReward(pid, referredUsers[i]);
        }
        return total;
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
     * @dev The self bonus will be payed only if the current user is referred.
     * @param originalAmount the original amount.
     * @param source the reward source address.
     */
    function _payBonus(
        uint256 originalAmount,
        IERC20 asset,
        address source
    ) internal {
        uint256 bonus = originalAmount.mulDiv(referralBonus, 100);
        address recipient = referral.referredFrom(source);
        if (bonus > 0 && recipient != address(0)) {
            _payReward(asset, recipient, bonus);
            referral.track(recipient, bonus);
            emit BonusPayed(recipient, bonus);

            // Pay also the self referral bonus (for having consumed a referral)
            uint256 selfBonus = originalAmount.mulDiv(selfReferralBonus, 1000);
            // Self bonus is not zero
            _payReward(asset, source, selfBonus);
            emit SelfBonusPayed(source, selfBonus);
        }
    }

    /**
     * @notice Update pool infos.
     * @param pid the pool identifier.
     */
    function updatePool(uint256 pid) internal virtual {
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
        return delta * bonusMultiplier;
    }
}
