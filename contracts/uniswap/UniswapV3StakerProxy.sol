// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
pragma abicoder v2;

import "@uniswap/v3-core/contracts/interfaces/IERC20Minimal.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {INonfungiblePositionManager} from "./interfaces/INonfungiblePositionManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IUniswapV3Staker} from "./interfaces/IUniswapV3Staker.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// eth mainnet
address constant UNIV3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
address constant UNIV3_STAKER = 0xe34139463bA50bD61336E0c446Bd8C0867c6fE65;
address constant UNIV3_NFT_POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
// fix the fee for now
uint24 constant FEE = 100;

/// @title Uniswap V3 staker contract proxy
/// @notice It handles user stakings by integrating all the bonus points obtained by referrals
contract UniswapV3StakerProxy is Ownable {
    using SafeERC20 for IERC20;

    mapping(uint256 => address) public originalOwners;

    error UniswapV3StakerProxyZeroAddress();

    /// @notice Constructor
    constructor() Ownable(msg.sender) {}

    /// @notice Create a new incentive
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
    /// @param tokenId The position tokenId
    /// @param key The incentive key created inside the staker contract
    function stake(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key
    ) external {
        address tokenOwner = msg.sender;
        // Cache the owner
        originalOwners[tokenId] = tokenOwner;
        // Deposit and stake
        INonfungiblePositionManager(UNIV3_NFT_POSITION_MANAGER)
            .safeTransferFrom(
                tokenOwner,
                UNIV3_STAKER,
                tokenId,
                computeUnhashedKey(key)
            );
    }

    /// @notice Unstake, collect and withraw the token
    /// @dev The token owner must have called `transferDeposit` before (https://github.com/Uniswap/v3-staker/blob/6d06fe4034e4eec53e1e587fc4770286466f4b35/contracts/UniswapV3Staker.sol#L179C14-L179C29)
    /// @param tokenId The token id
    /// @param key The incentive key
    /// @param reward The reward token
    /// @param rewardRecipient The reward destination
    /// @param tokenRecipient The token destination
    function unstake(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key,
        IERC20Minimal reward,
        address rewardRecipient,
        address tokenRecipient
    ) external {
        if (rewardRecipient == address(0))
            revert UniswapV3StakerProxyZeroAddress();
        if (tokenRecipient == address(0))
            revert UniswapV3StakerProxyZeroAddress();
        if (address(reward) == address(0))
            revert UniswapV3StakerProxyZeroAddress();

        // Unstake the token
        IUniswapV3Staker(UNIV3_STAKER).unstakeToken(key, tokenId);
        // Collect reward
        IUniswapV3Staker(UNIV3_STAKER).claimReward(reward, rewardRecipient, 0);
        // Withraw token
        bytes memory data = new bytes(0);
        IUniswapV3Staker(UNIV3_STAKER).withdrawToken(
            tokenId,
            tokenRecipient,
            data
        );
    }

    /// @notice Recover a deposit who changed owner to this contract
    /// @dev Can only be called from the origianl owner who did stake the token
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

    /// @notice Visualize the accued reward so far for a tokenId
    /// @param tokenId The position tokenId
    /// @param key The incentive key created inside the staker contract
    /// @return amount The accurent amount for the given tokenid and incentive
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
}
