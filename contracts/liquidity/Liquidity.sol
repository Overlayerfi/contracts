// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ILiquidityDefs.sol";
import "./interfaces/IRewardAsset.sol";
import "./interfaces/IBonusNFT.sol";

/**
 * @notice Liquidity contract implementation.
 */
contract Liquidity is
    Ownable,
    ReentrancyGuard,
    ILiquidityDefs,
    IERC721Receiver
{
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
     * @notice Referral bonus percentage for type Team.
     * @dev 5%
     */
    uint8 public referralBonusTeam = 5;

    /**
     * @notice Referral bonus percentage for type Ref.
     */
    uint8 public referralBonusRef = 0;

    /**
     * @notice Self referral bonus percentage for type Team.
     * @dev 2.5%
     */
    uint16 public selfReferralBonusTeam = 25;

    /**
     * @notice Self referral bonus percentage for type Ref.
     */
    uint16 public selfReferralBonusRef = 0;

    /**
     * @notice Referral contract.
     */
    IOverlayerReferral public referral;

    /**
     * @notice Overlayer Origin Shrimp NFT collection.
     */
    address public shrimp;

    /**
     * @notice Overlayer Origin Dolphin NFT collection.
     */
    address public dolphin;

    /**
     * @notice Overlayer Origin Whale NFT collection.
     */
    address public whale;

    /**
     * @notice Overlayer OG NFT collection. Holders get an extra 2.5% when an Origin NFT is staked.
     */
    address public ogNft;

    /**
     * @notice OG holder bonus numerator (2.5%).
     */
    uint16 public constant OG_BONUS_NUMERATOR = 25;

    /**
     * @notice OG holder bonus denominator.
     */
    uint16 public constant OG_BONUS_DENOMINATOR = 1000;

    /**
     * @notice Per-user Origin NFT stake (at most one).
     * @dev `collection == address(0)` means no Origin NFT is staked.
     */
    mapping(address => NftStake) public originNftStaked;

    /**
     * @notice Dynamically whitelisted bonus NFT collections.
     */
    mapping(address => bool) public whitelistedNft;

    /**
     * @notice Enumerable list of whitelisted bonus NFT collections.
     */
    address[] public whitelistedNftList;

    /**
     * @notice 1-based index of a collection inside {whitelistedNftList}.
     */
    mapping(address => uint256) private whitelistedNftListIndex;

    /**
     * @notice Per-user list of staked whitelisted NFTs.
     */
    mapping(address => NftStake[]) private whitelistedNftStakes;

    /**
     * @notice 1-based index of a user's staked whitelisted NFT.
     */
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        private whitelistedNftStakeIndex;

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

    /// @inheritdoc IERC721Receiver
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
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
     * @notice Update the referral bonus amount for a given type.
     * @dev It can not be over 100 (100%).
     * @param type_ the referral type.
     * @param referralBonus_ the bonus amount.
     */
    function updateReferralBonus(
        IOverlayerReferral.ReferralType type_,
        uint8 referralBonus_
    ) external onlyOwner {
        if (
            type_ != IOverlayerReferral.ReferralType.Team &&
            type_ != IOverlayerReferral.ReferralType.Ref
        ) {
            revert InvalidReferralType();
        }
        if (referralBonus_ <= 100) {
            if (type_ == IOverlayerReferral.ReferralType.Team) {
                referralBonusTeam = referralBonus_;
            } else {
                referralBonusRef = referralBonus_;
            }
            emit NewReferralBonus(type_, referralBonus_);
        }
    }

    /**
     * @notice Update the self referral bonus amount for a given type.
     * @dev It can not be over 1000 (100%).
     * @param type_ the referral type.
     * @param selfReferralBonus_ the bonus amount.
     */
    function updateSelfReferralBonus(
        IOverlayerReferral.ReferralType type_,
        uint16 selfReferralBonus_
    ) external onlyOwner {
        if (
            type_ != IOverlayerReferral.ReferralType.Team &&
            type_ != IOverlayerReferral.ReferralType.Ref
        ) {
            revert InvalidReferralType();
        }
        if (selfReferralBonus_ <= 1000) {
            if (type_ == IOverlayerReferral.ReferralType.Team) {
                selfReferralBonusTeam = selfReferralBonus_;
            } else {
                selfReferralBonusRef = selfReferralBonus_;
            }
            emit NewSelfReferralBonus(type_, selfReferralBonus_);
        }
    }

    /**
     * @notice Update the referral contract.
     * @param referral_ the referral contract.
     */
    function updateReferral(IOverlayerReferral referral_) external onlyOwner {
        referral = referral_;
        emit NewReferral(referral_);
    }

    /**
     * @notice Update the multiplier value.
     * @param bonusMultiplier_ the new multiplier value.
     */
    function updateMultiplier(uint256 bonusMultiplier_) external onlyOwner {
        _massUpdatePools();
        bonusMultiplier = bonusMultiplier_;
        emit NewBonusMultiplier(bonusMultiplier_);
    }

    /**
     * @notice Set the Overlayer Origin NFT collections used for exclusive Origin staking.
     * @param shrimp_ Shrimp collection address.
     * @param dolphin_ Dolphin collection address.
     * @param whale_ Whale collection address.
     */
    function setOriginNfts(
        address shrimp_,
        address dolphin_,
        address whale_
    ) external onlyOwner {
        if (
            shrimp_ == address(0) ||
            dolphin_ == address(0) ||
            whale_ == address(0)
        ) {
            revert InvalidZeroAddress();
        }
        shrimp = shrimp_;
        dolphin = dolphin_;
        whale = whale_;
        emit OriginNftsUpdated(shrimp_, dolphin_, whale_);
    }

    /**
     * @notice Set the Overlayer OG NFT collection used for the Origin holder boost.
     * @dev Pass the zero address to disable the OG boost. Holders are detected via balanceOf.
     * @param ogNft_ OG collection address.
     */
    function setOgNft(address ogNft_) external onlyOwner {
        ogNft = ogNft_;
        emit OgNftUpdated(ogNft_);
    }

    /**
     * @notice Add or remove a dynamically whitelisted bonus NFT collection.
     * @param collection The NFT collection.
     * @param allowed Whether the collection is allowed for staking.
     */
    function setWhitelistedNft(
        address collection,
        bool allowed
    ) external onlyOwner {
        if (collection == address(0)) {
            revert InvalidZeroAddress();
        }
        if (allowed) {
            if (whitelistedNft[collection]) {
                revert DuplicateWhitelistedNft();
            }
            if (IBonusNFT(collection).bonusDenominator() == 0) {
                revert InvalidBonusDenominator();
            }
            whitelistedNft[collection] = true;
            whitelistedNftList.push(collection);
            whitelistedNftListIndex[collection] = whitelistedNftList.length;
        } else {
            if (!whitelistedNft[collection]) {
                revert NftNotWhitelisted();
            }
            whitelistedNft[collection] = false;
            uint256 index = whitelistedNftListIndex[collection];
            uint256 lastIndex = whitelistedNftList.length;
            address lastCollection = whitelistedNftList[lastIndex - 1];
            if (index != lastIndex) {
                whitelistedNftList[index - 1] = lastCollection;
                whitelistedNftListIndex[lastCollection] = index;
            }
            whitelistedNftList.pop();
            delete whitelistedNftListIndex[collection];
        }
        emit WhitelistedNftUpdated(collection, allowed);
    }

    /**
     * @notice Stake an Overlayer Origin NFT (shrimp, dolphin, or whale). Only one at a time.
     * @dev Harvests all pools first so the new bonus applies only to newly farmed points.
     * @param collection Origin collection address.
     * @param tokenId Token ID to stake.
     */
    function stakeOriginNft(
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        if (!_isOriginNft(collection)) {
            revert InvalidOriginNft();
        }
        if (originNftStaked[msg.sender].collection != address(0)) {
            revert OriginAlreadyStaked();
        }
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) {
            revert NotNftOwner();
        }
        if (IBonusNFT(collection).bonusDenominator() == 0) {
            revert InvalidBonusDenominator();
        }

        _harvestAllPools(msg.sender);

        originNftStaked[msg.sender] = NftStake({
            collection: collection,
            tokenId: tokenId
        });
        IERC721(collection).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        emit OriginNftStaked(msg.sender, collection, tokenId);
    }

    /**
     * @notice Unstake the caller's Origin NFT.
     * @dev Harvests all pools first so the removed bonus stops applying only after payout.
     */
    function unstakeOriginNft() external nonReentrant {
        NftStake memory stake = originNftStaked[msg.sender];
        if (stake.collection == address(0)) {
            revert NoOriginStaked();
        }

        _harvestAllPools(msg.sender);

        delete originNftStaked[msg.sender];
        IERC721(stake.collection).safeTransferFrom(
            address(this),
            msg.sender,
            stake.tokenId
        );

        emit OriginNftUnstaked(msg.sender, stake.collection, stake.tokenId);
    }

    /**
     * @notice Stake a dynamically whitelisted bonus NFT.
     * @dev Harvests all pools first so the new bonus applies only to newly farmed points.
     * @param collection Whitelisted collection address.
     * @param tokenId Token ID to stake.
     */
    function stakeWhitelistedNft(
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        if (!whitelistedNft[collection]) {
            revert NftNotWhitelisted();
        }
        if (IERC721(collection).ownerOf(tokenId) != msg.sender) {
            revert NotNftOwner();
        }
        if (whitelistedNftStakeIndex[msg.sender][collection][tokenId] != 0) {
            revert DuplicateWhitelistedNft();
        }
        if (IBonusNFT(collection).bonusDenominator() == 0) {
            revert InvalidBonusDenominator();
        }

        _harvestAllPools(msg.sender);

        whitelistedNftStakes[msg.sender].push(
            NftStake({collection: collection, tokenId: tokenId})
        );
        whitelistedNftStakeIndex[msg.sender][collection][
            tokenId
        ] = whitelistedNftStakes[msg.sender].length;

        IERC721(collection).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        emit WhitelistedNftStaked(msg.sender, collection, tokenId);
    }

    /**
     * @notice Unstake a previously staked whitelisted bonus NFT.
     * @dev Harvests all pools first. Unstake is allowed even if the collection was later delisted.
     * @param collection Collection address.
     * @param tokenId Token ID to unstake.
     */
    function unstakeWhitelistedNft(
        address collection,
        uint256 tokenId
    ) external nonReentrant {
        uint256 index = whitelistedNftStakeIndex[msg.sender][collection][
            tokenId
        ];
        if (index == 0) {
            revert NftNotStaked();
        }

        _harvestAllPools(msg.sender);

        NftStake[] storage stakes = whitelistedNftStakes[msg.sender];
        uint256 lastIndex = stakes.length;
        NftStake memory lastStake = stakes[lastIndex - 1];
        if (index != lastIndex) {
            stakes[index - 1] = lastStake;
            whitelistedNftStakeIndex[msg.sender][lastStake.collection][
                lastStake.tokenId
            ] = index;
        }
        stakes.pop();
        delete whitelistedNftStakeIndex[msg.sender][collection][tokenId];

        IERC721(collection).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId
        );

        emit WhitelistedNftUnstaked(msg.sender, collection, tokenId);
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
        // harvest referral and NFT bonuses
        _payBonus(pending, pool.rewardAsset, msg.sender);
        //return stating funds
        if (amount > 0) {
            _returnStakedTokens(pool.stakedAsset, address(msg.sender), amount);
        }

        emit Withdraw(msg.sender, pid, amount);
    }

    /**
     * @notice Harvest reward for an account.
     * @dev This is allowed both before and after the end of pool endTimeStamp
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
        _harvestPool(pid, target);
    }

    /**
     * @notice Harvest reward.
     * @dev This is allowed both before and after the end of pool endTimeStamp
     * @param pid the pool identifier.
     */
    function harvest(uint256 pid) external override nonReentrant {
        if (pid >= poolInfo.length) {
            revert InvalidPid();
        }
        _harvestPool(pid, msg.sender);
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
     * @notice Return the caller's Origin NFT stake.
     * @param user The account to query.
     * @return collection Staked collection, or zero if none.
     * @return tokenId Staked token ID.
     */
    function originStakeOf(
        address user
    ) external view returns (address collection, uint256 tokenId) {
        NftStake memory stake = originNftStaked[user];
        return (stake.collection, stake.tokenId);
    }

    /**
     * @notice Return all whitelisted NFT stakes for a user.
     * @param user The account to query.
     */
    function whitelistedStakesOf(
        address user
    ) external view returns (NftStake[] memory) {
        return whitelistedNftStakes[user];
    }

    /**
     * @notice Return the number of whitelisted NFT collections.
     */
    function whitelistedNftListLength() external view returns (uint256) {
        return whitelistedNftList.length;
    }

    /**
     * @notice Compute the NFT bonus amount for a given base reward and user.
     * @param user The account whose staked NFTs are used.
     * @param amount The base pending reward amount.
     */
    function nftBonusOf(
        address user,
        uint256 amount
    ) external view returns (uint256) {
        return _nftBonusAmount(amount, user);
    }

    /**
     * @notice Pending base reward plus NFT bonus for a pool and user.
     * @dev Does not include referral or self-referral bonuses.
     * @param pid The pool identifier.
     * @param user The account to query.
     * @return total Base pending plus NFT bonus.
     */
    function pendingRewardWithNftBonus(
        uint256 pid,
        address user
    ) external view returns (uint256 total) {
        uint256 pending = pendingReward(pid, user);
        return pending + _nftBonusAmount(pending, user);
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

        // Block deposits if endtime is reached
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

        currentUser.rewardDebt = currentUser.amount.mulDiv(
            pool.accRewardPerShare,
            1e18
        );

        // Harvest is allowed for both vesting and not vesting pools
        uint256 pending = oldAmount.mulDiv(pool.accRewardPerShare, 1e18) -
            oldDebt;
        if (pending > 0) {
            _payReward(pool.rewardAsset, msg.sender, pending);
        }

        // harvest referral and NFT bonuses
        _payBonus(pending, pool.rewardAsset, msg.sender);

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
            uint256 multiplier = _getMultiplier(pid);

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
        IOverlayerReferral.ReferralType type_ = referral.referralCodeTypes(code);
        address[] memory referredUsers = referral.seeReferredByType(
            refSource,
            type_
        );
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
     * @notice Harvest every pool for a user using the current (pre-change) NFT stake set.
     * @param user The account to harvest.
     */
    function _harvestAllPools(address user) internal {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            _harvestPool(pid, user);
        }
    }

    /**
     * @notice Harvest a single pool for a user.
     * @param pid The pool identifier.
     * @param user The account to harvest.
     */
    function _harvestPool(uint256 pid, address user) internal {
        PoolInfo memory pool = poolInfo[pid];
        UserInfo storage currentUser = userInfo[pid][user];

        uint256 pending = pendingReward(pid, user);
        currentUser.rewardDebt = currentUser.rewardDebt + pending;

        if (pending > 0) {
            _payReward(pool.rewardAsset, user, pending);
        }
        _payBonus(pending, pool.rewardAsset, user);

        emit Harvest(user, pid, pending);
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
     * @notice Pay referral and NFT bonus tokens.
     * @dev Referral self bonus is paid per type only if the user is referred under that type.
     * @dev NFT bonus is paid for every staked Origin and whitelisted NFT.
     * @param originalAmount the original amount.
     * @param asset the reward asset.
     * @param source the reward source address.
     */
    function _payBonus(
        uint256 originalAmount,
        IERC20 asset,
        address source
    ) internal {
        if (originalAmount == 0) {
            return;
        }

        if (address(referral) != address(0)) {
            _payBonusForType(
                originalAmount,
                asset,
                source,
                IOverlayerReferral.ReferralType.Team,
                referralBonusTeam,
                selfReferralBonusTeam
            );
            _payBonusForType(
                originalAmount,
                asset,
                source,
                IOverlayerReferral.ReferralType.Ref,
                referralBonusRef,
                selfReferralBonusRef
            );
        }

        uint256 nftExtra = _nftBonusAmount(originalAmount, source);
        if (nftExtra > 0) {
            _payReward(asset, source, nftExtra);
            emit NftBonusPayed(source, nftExtra);
        }
    }

    /**
     * @notice Pay bonus for a single referral type.
     */
    function _payBonusForType(
        uint256 originalAmount,
        IERC20 asset,
        address source,
        IOverlayerReferral.ReferralType type_,
        uint8 referralBonus_,
        uint16 selfReferralBonus_
    ) internal {
        address recipient = referral.referredFromByType(source, type_);
        if (recipient == address(0)) {
            return;
        }
        uint256 bonus = originalAmount.mulDiv(referralBonus_, 100);
        if (bonus > 0) {
            _payReward(asset, recipient, bonus);
            referral.track(recipient, bonus);
            emit BonusPayed(recipient, bonus, type_);
        }

        uint256 selfBonus = originalAmount.mulDiv(selfReferralBonus_, 1000);
        if (selfBonus > 0) {
            _payReward(asset, source, selfBonus);
            emit SelfBonusPayed(source, selfBonus, type_);
        }
    }

    /**
     * @notice Compute NFT bonus for a base amount and user stake set.
     * @param originalAmount Base pending reward.
     * @param user Account whose NFTs are counted.
     */
    function _nftBonusAmount(
        uint256 originalAmount,
        address user
    ) internal view returns (uint256 total) {
        if (originalAmount == 0) {
            return 0;
        }

        NftStake memory originStake = originNftStaked[user];
        if (originStake.collection != address(0)) {
            total += _bonusFromCollection(
                originalAmount,
                originStake.collection
            );
            // OG holders get an extra 2.5% of base on top of the Origin bonus.
            if (ogNft != address(0) && IERC721(ogNft).balanceOf(user) > 0) {
                total += originalAmount.mulDiv(
                    OG_BONUS_NUMERATOR,
                    OG_BONUS_DENOMINATOR
                );
            }
        }

        NftStake[] storage stakes = whitelistedNftStakes[user];
        uint256 length = stakes.length;
        for (uint256 i = 0; i < length; ++i) {
            total += _bonusFromCollection(originalAmount, stakes[i].collection);
        }
    }

    /**
     * @notice Compute bonus from a single NFT collection for a base amount.
     */
    function _bonusFromCollection(
        uint256 originalAmount,
        address collection
    ) internal view returns (uint256) {
        uint256 denominator = IBonusNFT(collection).bonusDenominator();
        if (denominator == 0) {
            return 0;
        }
        return
            originalAmount.mulDiv(
                IBonusNFT(collection).bonusNumerator(),
                denominator
            );
    }

    /**
     * @notice Whether an address is a configured Origin NFT collection.
     */
    function _isOriginNft(address collection) internal view returns (bool) {
        return
            collection != address(0) &&
            (collection == shrimp ||
                collection == dolphin ||
                collection == whale);
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
        uint256 multiplier = _getMultiplier(pid);
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

        pool.lastRewardTime = Math.min(
            block.timestamp,
            pool.endTimeStamp != 0 ? pool.endTimeStamp : block.timestamp
        );
    }

    /**
     * @notice Get the multiplier value calculated between two times.
     * @param pid the pool id.
     * @return The difference between the two sides multiplied for the bonus.
     */
    function _getMultiplier(uint256 pid) internal view returns (uint256) {
        PoolInfo storage pool = poolInfo[pid];
        uint256 from = pool.lastRewardTime;
        uint256 to = Math.min(
            block.timestamp,
            pool.endTimeStamp != 0 ? pool.endTimeStamp : block.timestamp
        );
        // Sould never happen.
        if (to < from) {
            return 0;
        }

        uint256 delta = to - from;
        return delta * bonusMultiplier;
    }
}
