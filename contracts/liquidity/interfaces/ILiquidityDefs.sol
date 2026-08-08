// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../overlayer/interfaces/IOverlayerReferral.sol";

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
         *  1. The pool's `accRewardPerShare` (and `lastRewardTime`) gets updated.
         *  2. User receives the pending reward sent to his/her address.
         *  3. User's `amount` gets updated.
         */
    }

    /**
     * @notice Info on each pool.
     */
    struct PoolInfo {
        IERC20 stakedAsset; // Address of staked token contract
        IERC20 rewardAsset; // REward token
        uint256 allocPoints; // Pool weight
        uint256 lastRewardTime; // Last timestamp that REWARD distribution occured
        uint256 accRewardPerShare; // Accumulated REWARD per share, times 1e12. See below
        uint256 endTimeStamp; // If the pool is active or not
        bool vesting; // If harvest and withraw are allowed only at the end of the pool
    }

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);

    event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);

    event Harvest(address indexed user, uint256 indexed pid, uint256 amount);

    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    event NewBonusMultiplier(uint256 multiplier);

    event NewReferralBonus(
        IOverlayerReferral.ReferralType referralType,
        uint8 bonus
    );

    event NewSelfReferralBonus(
        IOverlayerReferral.ReferralType referralType,
        uint16 bonus
    );

    event NewReferral(IOverlayerReferral referral);

    event BonusPayed(
        address indexed recipient,
        uint256 amount,
        IOverlayerReferral.ReferralType referralType
    );

    event SelfBonusPayed(
        address indexed recipient,
        uint256 amount,
        IOverlayerReferral.ReferralType referralType
    );

    error InvalidReferralType();

    event NftBonusPayed(address indexed recipient, uint256 amount);

    event OriginNftsUpdated(address shrimp, address dolphin, address whale);

    event OgNftUpdated(address indexed ogNft);

    event WhitelistedNftUpdated(address indexed collection, bool allowed);

    event OriginNftStaked(
        address indexed user,
        address indexed collection,
        uint256 indexed tokenId
    );

    event OriginNftUnstaked(
        address indexed user,
        address indexed collection,
        uint256 indexed tokenId
    );

    event WhitelistedNftStaked(
        address indexed user,
        address indexed collection,
        uint256 indexed tokenId
    );

    event WhitelistedNftUnstaked(
        address indexed user,
        address indexed collection,
        uint256 indexed tokenId
    );

    /**
     * @notice A staked bonus NFT position.
     */
    struct NftStake {
        address collection;
        uint256 tokenId;
    }

    error NotAllowed();

    error VestingPool();

    error InvalidAmount();

    error InvalidPid();

    error InvalidZeroAddress();

    error InvactiveReward();

    error LiquidityNotActive();

    error InvalidTimeRange();

    error PoolNotActive();

    error AlreadyUsedStakedAsset();

    error InvalidOriginNft();

    error OriginAlreadyStaked();

    error NoOriginStaked();

    error NftNotWhitelisted();

    error NftNotStaked();

    error NotNftOwner();

    error InvalidBonusDenominator();

    error DuplicateWhitelistedNft();

    function poolLength() external view returns (uint256);

    function deposit(uint256 pid, uint256 amount) external;

    function withdraw(uint256 pid, uint256 amount) external;

    function harvest(uint256 pid) external;

    function harvestFor(uint256 pid, address target) external;

    function pendingReward(
        uint256 pid,
        address _user
    ) external view returns (uint256);

    function pendingRewardWithNftBonus(
        uint256 pid,
        address _user
    ) external view returns (uint256);

    function userInfo(
        uint256 pid,
        address _user
    ) external view returns (uint256, uint256);

    function emergencyWithdraw(uint256 pid) external;
}
