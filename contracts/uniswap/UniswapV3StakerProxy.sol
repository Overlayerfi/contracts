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
/// @notice Used to communciate with the staker contract
contract UniswapV3StakerProxy is Ownable {
    using SafeERC20 for IERC20;

    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

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
            revert ZeroAddress();
        }
        if (refundee == address(0)) {
            revert ZeroAddress();
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
    /// @param tokenId The position tokenId
    /// @param key The incentive key created inside the staker contract
    function stake(
        uint256 tokenId,
        IUniswapV3Staker.IncentiveKey memory key
    ) external {
        address tokenOwner = msg.sender;
        INonfungiblePositionManager(UNIV3_NFT_POSITION_MANAGER)
            .safeTransferFrom(
                tokenOwner,
                UNIV3_STAKER,
                tokenId,
                computeUnhashedKey(key)
            );
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
}
