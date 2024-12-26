// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ILiquidityDefs.sol";
import "./Liquidity.sol";

interface ICurvePool {
    function balances(uint256 index) external view returns (uint256);
    function coins(uint256 index) external view returns (address);
}

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/**
 * @notice Curve finance stable swap pool lp staking contract implementation.
 * This contract supports multiple staking pools to be deployed in the same contract sharing the reward token.
 */
contract CurveStableStake is Liquidity {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /**
     * @notice The emitted amount of reward for each second multiplier numerator.
     */
    mapping(address => uint256) public rewardsPerSecondMultiplierNum;

    /**
     * @notice The emitted amount of reward for each second multiplier denominator.
     */
    mapping(address => uint256) public rewardsPerSecondMultiplierDen;

    /**
     * @notice Track number of stable coins held inside Curve pools.
     */
    mapping(address => mapping(address => uint8)) public nCoinsTracker;

    /**
     * @notice Curve pools associated to Curve lps.
     */
    mapping(address => ICurvePool) public curvePools;

    /**
     * @notice The seconds in a year.
     */
    uint256 internal constant SECONDS_IN_YEAR = 1 days * 365;

    /**
     * @notice Contract constructor.
     * @param admin The contract admin
     * @param startTime_ The reward start time
     */
    constructor(
        address admin,
        uint256 startTime_
    ) Liquidity(admin, startTime_) {}

    /**
     * @notice Add a new pool and track the total coins held inside the Curve pool.
     * @dev It reverts if the starting time is set to zero
     * @param stakedAsset the wanted lp token.
     * @param rewardAsset the reward that will be payed out.
     * @param allocationPoints the weight of the added pool.
     * @param numCoins the total stable coins held inside the Curve pool.
     * @param pool the Curve pool associated to this lp.
     * @param update a boolean flag stating if update or not old pools.
     */
    function addWithNumCoinsAndPool(
        IERC20 stakedAsset,
        IERC20 rewardAsset,
        uint256 allocationPoints,
        uint8 numCoins,
        ICurvePool pool,
        bool update
    ) external onlyOwner {
        if (address(pool) == address(0)) {
            revert InvalidZeroAddress();
        }
        super.add(stakedAsset, rewardAsset, allocationPoints, update);

        nCoinsTracker[address(stakedAsset)][address(rewardAsset)] = numCoins;
        curvePools[address(stakedAsset)] = pool;
    }

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
        if (
            rewardsPerSecondMultiplierNum[address(rewardAsset)] != rewardRateNum
        ) {
            rewardsPerSecondMultiplierNum[address(rewardAsset)] = rewardRateNum;
        }
        if (
            rewardsPerSecondMultiplierDen[address(rewardAsset)] != rewardRateDen
        ) {
            rewardsPerSecondMultiplierDen[address(rewardAsset)] = rewardRateDen;
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
            uint256 multiplier = _getMultiplier(
                pool.lastRewardTime,
                block.timestamp
            );

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
        uint256 multiplier = _getMultiplier(
            pool.lastRewardTime,
            block.timestamp
        );
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

        pool.lastRewardTime = block.timestamp;
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
        uint8 nCoins = nCoinsTracker[address(staked)][address(reward)];
        uint256 totalLiquidity = 0;

        for (uint8 i = 0; i < nCoins; ) {
            address addr = curvePools[address(staked)].coins(i);
            uint8 dec = IERC20Decimals(addr).decimals();
            uint256 bal = curvePools[address(staked)].balances(i);
            uint8 k = 18 - dec;
            bal = bal * (10 ** k);
            totalLiquidity += bal;
            unchecked {
                i++;
            }
        }

        uint256 stakedLp = staked.balanceOf(address(this));
        uint256 totalLiquidityHeld = totalLiquidity.mulDiv(
            stakedLp,
            staked.totalSupply()
        );

        // No liquidity
        if (totalLiquidityHeld < 1 ether) {
            return 0;
        }

        return
            totalLiquidityHeld.mulDiv(
                rewardsPerSecondMultiplierNum[address(reward)],
                rewardsPerSecondMultiplierDen[address(reward)]
            ) / SECONDS_IN_YEAR;
    }
}
