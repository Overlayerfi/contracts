// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ILiquidityDefs.sol";
import "./Liquidity.sol";

/**
 * @notice Single stable coin staking contract implementation.
 * This contract supports multiple staking pools to be deployed in the same contract sharing the reward token.
 */
contract SingleStableStake is Liquidity {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /**
     * @notice The emitted amount of reward for each year multiplier numerator.
     */
    mapping(address => uint256) public rewardsPerYearMultiplierNum;

    /**
     * @notice The emitted amount of reward for each year multiplier denominator.
     */
    mapping(address => uint256) public rewardsPerYearMultiplierDen;

    /**
     * @notice The seconds in a year.
     */
    uint256 internal constant SECONDS_IN_YEAR = 1 days * 365;

    /**
     * @notice Contract constructor.
     * @param admin The contract admin
     */
    constructor(address admin) Liquidity(admin) {}

    /**
     * @notice Set a reward rate.
     * @param rewardAsset the reward.
     * @param rewardRateNum the new reward rate numerator.
     * @param rewardRateDen the new reward rate denominator.
     */
    function setRewardForStakedAssets(
        IERC20 rewardAsset,
        uint256 rewardRateNum,
        uint256 rewardRateDen
    ) external onlyOwner {
        if (!activeRewards[address(rewardAsset)]) {
            activeRewards[address(rewardAsset)] = true;
        }
        _massUpdatePools();
        if (
            rewardsPerYearMultiplierNum[address(rewardAsset)] != rewardRateNum
        ) {
            rewardsPerYearMultiplierNum[address(rewardAsset)] = rewardRateNum;
        }
        if (
            rewardsPerYearMultiplierDen[address(rewardAsset)] != rewardRateDen
        ) {
            rewardsPerYearMultiplierDen[address(rewardAsset)] = rewardRateDen;
        }
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
    ) public view override returns (uint256) {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }

        PoolInfo memory pool = poolInfo[pid];
        UserInfo memory currentUser = userInfo[pid][user];

        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 stakedAssetSupply = pool.stakedAsset.balanceOf(address(this));
        if (block.timestamp > pool.lastRewardTime && stakedAssetSupply != 0) {
            uint256 multiplier = _getMultiplier(pid);

            // This is the same computation made in the updatePool function. Just a view version.
            uint256 rewards = multiplier *
                (
                    rewardsForStakedAssets(pool.stakedAsset, pool.rewardAsset)
                        .mulDiv(
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
     * @notice Update pool infos.
     * @param pid the pool identifier.
     */
    function updatePool(uint256 pid) internal override {
        PoolInfo storage pool = poolInfo[pid];
        if (block.timestamp <= pool.lastRewardTime) {
            return;
        }
        uint256 stakedAssetSupply = pool.stakedAsset.balanceOf(address(this));
        if (stakedAssetSupply == 0) {
            pool.lastRewardTime = block.timestamp;
            return;
        }
        uint256 multiplier = _getMultiplier(pid);
        uint256 rewards = multiplier *
            (
                rewardsForStakedAssets(pool.stakedAsset, pool.rewardAsset)
                    .mulDiv(
                        pool.allocPoints,
                        totalAllocPointsPerReward[address(pool.rewardAsset)]
                    )
            );
        pool.accRewardPerShare =
            pool.accRewardPerShare +
            rewards.mulDiv(1e18, stakedAssetSupply);

        pool.lastRewardTime = Math.min(
            block.timestamp,
            pool.endTimeStamp != 0 ? pool.endTimeStamp : block.timestamp
        );
    }

    /**
     * @notice Get the reward amount for second based on the total staked liquidity.
     * @dev If the staked amount is less than 1 ether or less than a second then the emitted amount will be zero.
     * @param staked the staked asset.
     * @param reward the reward asset.
     * @return the emitted reward for staked asset for second.
     */
    function rewardsForStakedAssets(
        IERC20 staked,
        IERC20 reward
    ) internal view returns (uint256) {
        uint256 stakedAmount = staked.balanceOf(address(this));

        // No liquidity
        if (stakedAmount < 1 ether) {
            return 0;
        }

        return
            stakedAmount.mulDiv(
                rewardsPerYearMultiplierNum[address(reward)],
                rewardsPerYearMultiplierDen[address(reward)]
            ) / SECONDS_IN_YEAR;
    }
}
