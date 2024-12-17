// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";
import {IOvaReferral} from "../token/interfaces/IOvaReferral.sol";
import {IRewardAsset} from "../liquidity/interfaces/IRewardAsset.sol";
import {IUniswapV3Staker} from "./interfaces/IUniswapV3Staker.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

library IncentiveId {
    /// @notice Calculate the key for a staking incentive
    /// @param key The components used to compute the incentive identifier
    /// @return incentiveId The identifier for the incentive
    function compute(
        IUniswapV3Staker.IncentiveKey memory key
    ) internal pure returns (bytes32 incentiveId) {
        return keccak256(abi.encode(key));
    }
}

// eth mainnet
// fix the fee for now
uint24 constant FEE = 100;

/// @title Uniswap V3 staker contract proxy
/// @notice It handles user stakings by integrating all the bonus points obtained by referrals
contract UniswapV3StakerProxy is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    /// @notice Cache of original token owners
    mapping(uint256 => address) public originalOwners;

    /// @notice Referral bonus amount
    /// @dev 5%
    uint8 public referralBonus = 5;

    /// @notice Self referral bonus amount
    /// @dev 1.5%
    uint16 public selfReferralBonus = 15;

    /// @notice Ova referral contract
    IOvaReferral public referral;

    /// @notice Uniswap V3 factory address
    address immutable UNIV3_FACTORY;

    /// @notice Uniswap V3 staker address
    address immutable UNIV3_STAKER;

    /// @notice Uniswap V3 NFT position manager address
    address immutable UNIV3_NFT_POSITION_MANAGER;

    event UniswapV3StakerReferralUpdated(IOvaReferral referral);

    event UniswapV3StakerReferralBonusUpdated(uint8 bonus);

    event UniswapV3StakerReferralBonusPayed(
        address indexed recipient,
        uint256 amount
    );

    event UniswapV3StakerSelfReferralBonusUpdated(uint16 bonus);

    event UniswapV3StakerSelfReferralBonusPayed(
        address indexed recipient,
        uint256 amount
    );

    error UniswapV3StakerProxyZeroAddress();

    /// @notice Constructor
    /// @param admin The contract admin
    constructor(
        address admin,
        address univ3_factory,
        address univ3_staker,
        address univ3_nft_pos
    ) Ownable(admin) {
        UNIV3_FACTORY = univ3_factory;
        UNIV3_STAKER = univ3_staker;
        UNIV3_NFT_POSITION_MANAGER = univ3_nft_pos;
    }

    /// @notice Update the referral contract
    /// @param referral_ The new referral contract
    function updateReferral(IOvaReferral referral_) external onlyOwner {
        referral = referral_;
        emit UniswapV3StakerReferralUpdated(referral);
    }

    /**
     * @notice Update the referral bonus amount.
     * @dev It can not be over 100 (100%).
     * @param referralBonus_ the bonus amount.
     */
    function updateReferralBonus(uint8 referralBonus_) external onlyOwner {
        if (referralBonus_ <= 100) {
            referralBonus = referralBonus_;
            emit UniswapV3StakerReferralBonusUpdated(referralBonus_);
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
            emit UniswapV3StakerSelfReferralBonusUpdated(selfReferralBonus_);
        }
    }

    /// @notice Create a new incentive
    /// @dev Public uniswap staker allows a max incentive time of 63072000 seconds (https://etherscan.io/address/0xe34139463ba50bd61336e0c446bd8c0867c6fe65#readContract)
    /// @param token0 The first pool token
    /// @param token1 The second pool token
    /// @param reward The reward token
    /// @param rewardAmount The total reward amount
    /// @param startTime The reward start time
    /// @param endTime The reward end time
    /// @param refundee The reward refundee if any left
    function createIncentive(
        address token0,
        address token1,
        address reward,
        uint256 rewardAmount,
        uint256 startTime,
        uint256 endTime,
        address refundee
    ) external onlyOwner {
        if (reward == address(0)) {
            revert UniswapV3StakerProxyZeroAddress();
        }
        if (refundee == address(0)) {
            revert UniswapV3StakerProxyZeroAddress();
        }

        IUniswapV3Staker.IncentiveKey memory key = IUniswapV3Staker
            .IncentiveKey(
                IERC20Minimal(reward),
                getPool(token0, token1),
                startTime,
                endTime,
                refundee != address(0) ? refundee : owner()
            );

        IERC20(reward).safeTransferFrom(
            msg.sender,
            address(this),
            rewardAmount
        );
        IERC20(reward).safeIncreaseAllowance(UNIV3_STAKER, rewardAmount);

        IUniswapV3Staker(UNIV3_STAKER).createIncentive(key, rewardAmount);
    }

    /// @notice Deposit a token into the staker contract
    /// @dev This transfer will trigger deposit + stake inside the staker contract
    /// @dev The original token owner is cached if any token is blocked inside this contract
    /// @dev Referral is consumed if the source valid
    /// @param tokenId The position tokenId
    /// @param key The incentive key created inside the staker contract
    /// @param referralSource Any referral source
    function stake(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key,
        address referralSource
    ) external nonReentrant {
        address tokenOwner = msg.sender;
        // Cache the owner
        originalOwners[tokenId] = tokenOwner;

        // Consume referral if the current user has not been referred.
        // We have to perform that msg.sender has been never referred
        // check otherwise the tx will revert for additional stakes.
        if (
            address(referral) != address(0) &&
            referral.referredFrom(msg.sender) == address(0) &&
            referralSource != address(0)
        ) {
            referral.consumeReferral(referralSource, msg.sender);
        }

        // Deposit and stake
        INonfungiblePositionManager(UNIV3_NFT_POSITION_MANAGER)
            .safeTransferFrom(
                tokenOwner,
                UNIV3_STAKER,
                tokenId,
                computeUnhashedKey(key)
            );
    }

    /// @notice Unstake, collect and withdraw the token
    /// @dev The token owner must have called `transferDeposit` before (https://github.com/Uniswap/v3-staker/blob/6d06fe4034e4eec53e1e587fc4770286466f4b35/contracts/UniswapV3Staker.sol#L179C14-L179C29)
    /// @dev If user has being referred, the referral source will gain the referral bonus
    /// and the current user will gain the self referral bonus
    /// @param tokenId The token id
    /// @param key The incentive key
    /// @param reward The reward token
    /// @param rewardRecipient The reward destination
    /// @param tokenRecipient The token destination
    /// @return The collected reward amount
    function unstake(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key,
        IERC20Minimal reward,
        address rewardRecipient,
        address tokenRecipient
    ) external nonReentrant returns (uint256) {
        if (rewardRecipient == address(0))
            revert UniswapV3StakerProxyZeroAddress();
        if (tokenRecipient == address(0))
            revert UniswapV3StakerProxyZeroAddress();
        if (address(reward) == address(0))
            revert UniswapV3StakerProxyZeroAddress();

        // Unstake the token
        IUniswapV3Staker(UNIV3_STAKER).unstakeToken(key, tokenId);
        // Collect reward
        uint256 collected = IUniswapV3Staker(UNIV3_STAKER).claimReward(
            reward,
            rewardRecipient,
            0 //claim alll
        );
        // Withraw token
        bytes memory data = new bytes(0);
        IUniswapV3Staker(UNIV3_STAKER).withdrawToken(
            tokenId,
            tokenRecipient,
            data
        );

        // Referral bonus
        if (address(referral) != address(0)) {
            _payBonus(address(reward), collected, rewardRecipient);
        }

        return collected;
    }

    /// @notice Recover a deposit who changed owner to this contract
    /// @dev Can only be called from the original owner who did stake the token
    /// @param tokenId The token to recover
    function recoverDeposit(uint256 tokenId) external {
        (address depositOwner, , , ) = IUniswapV3Staker(UNIV3_STAKER).deposits(
            tokenId
        );
        if (
            depositOwner == address(this) &&
            originalOwners[tokenId] == msg.sender
        ) {
            IUniswapV3Staker(UNIV3_STAKER).transferDeposit(tokenId, msg.sender);
        }
    }

    /// @notice Visualize the accrued reward so far for a tokenId
    /// @param tokenId The position tokenId
    /// @param key The incentive key created inside the staker contract
    /// @return amount The accrued amount for the given tokenid and incentive
    function getRewardInfo(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key
    ) external view returns (uint256) {
        (uint256 amount, ) = IUniswapV3Staker(UNIV3_STAKER).getRewardInfo(
            key,
            tokenId
        );
        return amount;
    }

    /// @notice Visualize the owned reward to an owner
    /// @dev The amount will we non zero only after unstaking
    /// @param reward The reward address
    /// @param owner_ The owner to query
    /// @return The amount of owned rewards
    function rewardsOwned(
        IERC20Minimal reward,
        address owner_
    ) external view returns (uint256) {
        return IUniswapV3Staker(UNIV3_STAKER).rewards(reward, owner_);
    }

    /// @notice Retrieve the hash related to an incentive key
    /// @param key The incentive key
    /// @return The hash
    function incentiveId(
        IUniswapV3Staker.IncentiveKey memory key
    ) public pure returns (bytes32) {
        return IncentiveId.compute(key);
    }

    /// @notice Retrieve a pool address
    /// @dev Fee amount is fixed for now
    /// @param token0 The first token
    /// @param token1 The second token
    /// @return The pool address as interface
    function getPool(
        address token0,
        address token1
    ) public view returns (IUniswapV3Pool) {
        return
            IUniswapV3Pool(
                IUniswapV3Factory(UNIV3_FACTORY).getPool(token0, token1, FEE)
            );
    }

    /// @notice Compute the packed struct
    /// @param key The incentive key to be packed
    /// @return The packed key
    function computeUnhashedKey(
        IUniswapV3Staker.IncentiveKey memory key
    ) public pure returns (bytes memory) {
        return abi.encode(key);
    }

    /**
     * @notice Pay the reward bonus to referral source.
     * @dev The reward asset is directly minted from the reward token
     * @param rewardAsset the reward token.
     * @param amount the original collected amount.
     * @param selfBonusRecipient The self bonus recipient
     */
    function _payBonus(
        address rewardAsset,
        uint256 amount,
        address selfBonusRecipient
    ) internal {
        uint256 bonus = amount.mulDiv(referralBonus, 100);
        address recipient = referral.referredFrom(msg.sender);
        // Pay only if the referral source do exist (is not address(0))
        if (bonus > 0 && recipient != address(0)) {
            IRewardAsset(rewardAsset).mint(recipient, bonus);
            referral.track(recipient, bonus);
            emit UniswapV3StakerReferralBonusPayed(recipient, bonus);

            // Pay also the self referral bonus (for having consumed a referral)
            uint256 selfBonus = amount.mulDiv(selfReferralBonus, 1000);
            // Self bonus is not zero
            IRewardAsset(rewardAsset).mint(selfBonusRecipient, selfBonus);
            emit UniswapV3StakerSelfReferralBonusPayed(
                selfBonusRecipient,
                selfBonus
            );
        }
    }
}
