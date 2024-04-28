// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../mock_ERC20/interfaces/IMintableErc20.sol";

/**
 * @notice Liquidity contract implementation.
 */
contract Liquidity is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /**
     * @notice Info on each user.
     */
    struct UserInfo {
        uint256 amount; // How many LP tokens the user has provided.
        uint256 rewardDebt; // Reward debt. See explanation below.
        /**
         * @notice The strategy used by the vault.
         *
         * We do some fancy math here. Basically, any point in time, the amount of REWARD
         * entitled to a user but is pending to be distributed is:
         *
         *  pending reward = (user.amount * pool.accRewardPerShare)
         *
         * Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
         *  1. The pool's `accRewardPerShare` (and `lastRewardBlock`) gets updated.
         *  2. User receives the pending reward sent to his/her address.
         *  3. User's `amount` gets updated.
         */
    }

    /**
     * @notice Info on each pool.
     */
    struct PoolInfo {
        IERC20 lpToken; // Address of LP token contract.
        IERC20 reward; // REWARD token.
        uint256 allocPoints; // Pool weight
        uint256 lastRewardBlock; // Last block number that REWARD distribution occurs.
        uint256 accRewardPerShare; // Accumulated REWARD per share, times 1e12. See below.
    }

    /**
     * @notice The team address.
     */
    address public devaddr;

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
    uint256 public BONUS_MULTIPLIER = 1;

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    modifier onlyTeam() {
        require(
            owner() == msg.sender || devaddr == msg.sender,
            "Liquidity: Not allowed"
        );
        _;
    }

    /**
     * @notice Contract constructor.
     * @dev It sets the initial owner as the devaddr
     * @param _devaddr The developer team address
     * @param _startBlock The reward start block
     */
    constructor(address _devaddr, uint256 _startBlock) Ownable(_devaddr) {
        require(_devaddr != address(0));
        devaddr = _devaddr;
        startBlock = _startBlock;
    }

    /**
     * @notice Update the multiplier value.
     * @param _new the new multiplier value.
     */
    function updateMultiplier(uint256 _new) external onlyTeam {
        BONUS_MULTIPLIER = _new;
    }

    /**
     * @notice Get the pool lenght.
     * @return the lenght of the liquidity info.
     */
    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    /**
     * @notice Set a reward rate.
     * @param _reward the reward.
     * @param _newRewardRate the new reward rate.
     */
    function setReward(
        IERC20 _reward,
        uint256 _newRewardRate
    ) external onlyTeam {
        if (!activeRewards[address(_reward)]) {
            activeRewards[address(_reward)] = true;
        }
        if (rewardsPerBlock[address(_reward)] != _newRewardRate) {
            rewardsPerBlock[address(_reward)] = _newRewardRate;
        }
    }

    /**
     * @notice Add a new pool to the kitchen.
     * @param _lpToken the wanted lp token.
     * @param _reward the reward that will be payed out.
     * @param _allocPoints the weight of the added pool.
     * @param _withUpdate a boolean flag stating if update or not old pools.
     */
    function add(
        IERC20 _lpToken,
        IERC20 _reward,
        uint256 _allocPoints,
        bool _withUpdate
    ) public onlyTeam {
        require(
            activeRewards[address(_reward)],
            "Liquidity: Reward not active"
        );
        if (_withUpdate) {
            _massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPointsPerReward[address(_reward)] =
            totalAllocPointsPerReward[address(_reward)] +
            (_allocPoints);
        poolInfo.push(
            PoolInfo({
                lpToken: _lpToken,
                reward: _reward,
                allocPoints: _allocPoints,
                lastRewardBlock: lastRewardBlock,
                accRewardPerShare: 0
            })
        );
    }

    /**
     * @notice Get the total amount of tokens staked inside a pool.
     * @param _pid the pool identifier.
     * @return the amount of token staked inside the given pool.
     */
    function getTotalStakedInPool(
        uint256 _pid
    ) external view onlyTeam returns (uint256) {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");
        return (poolInfo[_pid].lpToken.balanceOf(address(this)));
    }

    /**
     * @notice Get the multiplier value calculated between two blocks.
     * @param _from the starting block.
     * @param _to the ending block.
     * @return the difference between the two sides multiplied for the bonus.
     */
    function _getMultiplier(
        uint256 _from,
        uint256 _to
    ) internal view returns (uint256) {
        if (_from >= _to) {
            return 0;
        }
        return _to - (_from) / (BONUS_MULTIPLIER);
    }

    /**
     * @notice Modify the allocation points for a pool.
     * @param _pid the pool pid.
     * @param _newPoints the new weight.
     * @return newTotal the new total allocation.
     */
    function setPoolAllocPoints(
        uint256 _pid,
        uint256 _newPoints,
        bool _withUpdate
    ) external onlyTeam returns (uint256 newTotal) {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");

        if (_withUpdate) {
            _massUpdatePools();
        }
        PoolInfo storage pool = poolInfo[_pid];
        uint256 oldPoints = pool.allocPoints;
        pool.allocPoints = _newPoints;
        if (oldPoints != _newPoints) {
            totalAllocPointsPerReward[address(pool.reward)] =
                totalAllocPointsPerReward[address(pool.reward)] -
                (oldPoints) +
                (_newPoints);
        }
        newTotal = totalAllocPointsPerReward[address(pool.reward)];
    }

    /**
     * @notice Get the pending reward for a given pool and user.
     * @param _pid the pool identifier.
     * @param _user the participant.
     * @return the pending reward for given pool and user.
     */
    function pendingReward(
        uint256 _pid,
        address _user
    ) public view returns (uint256) {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");

        PoolInfo memory pool = poolInfo[_pid];
        UserInfo memory user = userInfo[_pid][_user];

        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = _getMultiplier(
                pool.lastRewardBlock,
                block.number
            );
            uint256 reward = (multiplier *
                (rewardsPerBlock[address(pool.reward)]) *
                (pool.allocPoints)) /
                (totalAllocPointsPerReward[address(pool.reward)]);
            // Note, this calculation won't update pool accRewardPerShare status
            accRewardPerShare =
                accRewardPerShare +
                ((reward * (1e12)) / (lpSupply));
        }
        return (user.amount * (accRewardPerShare)) / (1e12) - (user.rewardDebt);
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
     * @notice Update pool infos.
     * @param _pid the pool identifier.
     */
    function updatePool(uint256 _pid) internal {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.lpToken.balanceOf(address(this));
        if (lpSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = _getMultiplier(pool.lastRewardBlock, block.number);
        uint256 reward = (multiplier *
            (rewardsPerBlock[address(pool.reward)]) *
            (pool.allocPoints)) /
            (totalAllocPointsPerReward[address(pool.reward)]);

        pool.accRewardPerShare =
            pool.accRewardPerShare +
            ((reward * (1e12)) / (lpSupply));
        pool.lastRewardBlock = block.number;
    }

    /**
     * @notice Deposit into the pool with harvest.
     * @param _pid the pool identifier.
     * @param _amount the amount to deposit.
     */
    function deposit(uint256 _pid, uint256 _amount) external nonReentrant {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");

        // Get pool and user
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        // update the pool up to date
        updatePool(_pid);

        // harvest up to date rewards
        if (user.amount > 0) {
            uint256 pending = (user.amount * (pool.accRewardPerShare)) /
                (1e12) -
                (user.rewardDebt);
            if (pending > 0) {
                _payReward(pool.reward, msg.sender, pending);
            }
        }
        if (_amount > 0) {
            pool.lpToken.safeTransferFrom(
                address(msg.sender),
                address(this),
                _amount
            );
            user.amount = user.amount + (_amount);
        }
        // update reward debt, there is harvest on deposit so at every deposit the debt will be reset with the new amount the user has.
        user.rewardDebt = (user.amount * (pool.accRewardPerShare)) / (1e12);
        emit Deposit(msg.sender, _pid, _amount);
    }

    /**
     * @notice Withdraw from the pool with harvest.
     * @param _pid the pool identifier.
     * @param _amount the amount to withdraw.
     */
    function withdraw(uint256 _pid, uint256 _amount) external nonReentrant {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");

        // Get pool and user
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        require(user.amount >= _amount, "Liquidity: withdraw balance exceeded");

        // update the pool up to date
        updatePool(_pid);

        uint256 pending = (user.amount * (pool.accRewardPerShare)) /
            (1e12) -
            (user.rewardDebt);

        if (pending > 0) {
            _payReward(pool.reward, msg.sender, pending);
        }
        if (_amount > 0) {
            user.amount = user.amount - (_amount);
            _returnStakedTokens(pool.lpToken, address(msg.sender), _amount);
        }
        // update reward debt, there is harvest on withdraw so at every deposit the debt will be reset with the new amount the user has.
        user.rewardDebt = (user.amount * (pool.accRewardPerShare)) / (1e12);
        emit Withdraw(msg.sender, _pid, _amount);
    }

    /**
     * @notice Harvest reward.
     * @param _pid the pool identifier.
     */
    function harvest(uint256 _pid) external nonReentrant {
        require(_pid < poolInfo.length, "Liquidity: Invalid pid");

        // Get pool and user
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 pending = pendingReward(_pid, msg.sender);
        if (pending > 0) {
            _payReward(pool.reward, msg.sender, pending);
        }

        // update reward debt
        user.rewardDebt = user.rewardDebt + (pending);
        emit Harvest(msg.sender, _pid, pending);
    }

    /**
     * @notice Pay the reward.
     * @param _reward the reward token.
     * @param _to the reward receiver.
     * @param _amount the amount to be payed.
     */
    function _payReward(IERC20 _reward, address _to, uint256 _amount) internal {
        IMintableERC20(address(_reward)).mint(_amount);
        _reward.safeTransfer(_to, _amount);
    }

    /**
     * @notice Return the staked tokens.
     * @param _token the staked token.
     * @param _to the reward receiver.
     * @param _amount the amount to be returned.
     */
    function _returnStakedTokens(
        IERC20 _token,
        address _to,
        uint256 _amount
    ) internal {
        _token.safeTransfer(_to, _amount);
    }

    /**
     * @notice Emergency withdraw all the deposited funds.
     * @param _pid the pool identifier.
     */
    function emergencyWithdraw(uint256 _pid) external nonReentrant {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];

        uint256 toWithdraw = user.amount;
        user.amount = 0;
        user.rewardDebt = 0;
        if (toWithdraw > 0) {
            _returnStakedTokens(pool.lpToken, address(msg.sender), toWithdraw);
        }

        emit EmergencyWithdraw(msg.sender, _pid, toWithdraw);
    }

    /**
     * @notice Update the team address.
     * @param _devaddr the new team address.
     */
    function updateDev(address _devaddr) external onlyTeam {
        require(_devaddr != address(0));
        require(msg.sender == devaddr, "Liquidity: go away");
        devaddr = _devaddr;
    }
}
