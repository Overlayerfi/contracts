// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {INonfungiblePositionManager} from "../interfaces/INonfungiblePositionManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IWETH} from "../interfaces/IWETH.sol";

// eth mainnet addresses
address constant UNIV3_POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

/// @title Proxy contract to interact with the Uniswap V3 liquidity
/// @dev This a test helper contract. Do not use in prod
contract UniswapV3LiquidityProxy is IERC721Receiver {
    /// @dev This tick may work only for DAI-WETH
    int24 private constant MIN_TICK = -887272;
    /// @dev This tick may work only for DAI-WETH
    int24 private constant MAX_TICK = -MIN_TICK;
    /// @dev This tick may work only for DAI-WETH
    int24 private constant TICK_SPACING = 60;

    INonfungiblePositionManager public nonfungiblePositionManager =
        INonfungiblePositionManager(UNIV3_POSITION_MANAGER);

    event Mint(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1,
        uint24 fee
    );

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Mint a new liquidity position
    /// @param token0 The first liquidity token
    /// @param token1 The second liquidity token
    /// @param amount0ToAdd The amount of the first token
    /// @param amount1ToAdd The amount of the second token
    /// @param fee The fee amount
    function mintNewPosition(
        address token0,
        address token1,
        uint256 amount0ToAdd,
        uint256 amount1ToAdd,
        uint24 fee
    )
        external
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        )
    {
        IERC20(token0).transferFrom(msg.sender, address(this), amount0ToAdd);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1ToAdd);

        IERC20(token0).approve(
            address(nonfungiblePositionManager),
            amount0ToAdd
        );
        IERC20(token1).approve(
            address(nonfungiblePositionManager),
            amount1ToAdd
        );

        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: (MIN_TICK / TICK_SPACING) * TICK_SPACING,
                tickUpper: (MAX_TICK / TICK_SPACING) * TICK_SPACING,
                amount0Desired: amount0ToAdd,
                amount1Desired: amount1ToAdd,
                amount0Min: 0,
                amount1Min: 0,
                recipient: msg.sender,
                deadline: block.timestamp
            });

        (tokenId, liquidity, amount0, amount1) = nonfungiblePositionManager
            .mint(params);

        if (amount0 < amount0ToAdd) {
            IERC20(token0).approve(address(nonfungiblePositionManager), 0);
            uint256 refund0 = amount0ToAdd - amount0;
            IERC20(token0).transfer(msg.sender, refund0);
        }
        if (amount1 < amount1ToAdd) {
            IERC20(token1).approve(address(nonfungiblePositionManager), 0);
            uint256 refund1 = amount1ToAdd - amount1;
            IERC20(token1).transfer(msg.sender, refund1);
        }

        emit Mint(tokenId, liquidity, amount0, amount1, fee);
    }

    /// @notice Collect a position fees
    /// @param tokenId The position token id
    function collectAllFees(
        uint256 tokenId
    ) external returns (uint256 amount0, uint256 amount1) {
        INonfungiblePositionManager.CollectParams
            memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });

        (amount0, amount1) = nonfungiblePositionManager.collect(params);
    }

    /// @notice Increase the current range liquidity position
    /// @param token0 The first liquidity token
    /// @param token1 The second liquidity token
    /// @param tokenId The position token id
    /// @param amount0ToAdd The amount of the first token
    /// @param amount1ToAdd The amount of the second token
    function increaseLiquidityCurrentRange(
        address token0,
        address token1,
        uint256 tokenId,
        uint256 amount0ToAdd,
        uint256 amount1ToAdd
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        IERC20(token0).transferFrom(msg.sender, address(this), amount0ToAdd);
        IERC20(token1).transferFrom(msg.sender, address(this), amount1ToAdd);

        IERC20(token0).approve(
            address(nonfungiblePositionManager),
            amount0ToAdd
        );
        IERC20(token1).approve(
            address(nonfungiblePositionManager),
            amount1ToAdd
        );

        INonfungiblePositionManager.IncreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .IncreaseLiquidityParams({
                    tokenId: tokenId,
                    amount0Desired: amount0ToAdd,
                    amount1Desired: amount1ToAdd,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        (liquidity, amount0, amount1) = nonfungiblePositionManager
            .increaseLiquidity(params);
    }

    /// @notice Decrease the current range liquidity position
    /// @param tokenId The position token id
    /// @param liquidity The amount of liquidity
    function decreaseLiquidityCurrentRange(
        uint256 tokenId,
        uint128 liquidity
    ) external returns (uint256 amount0, uint256 amount1) {
        INonfungiblePositionManager.DecreaseLiquidityParams
            memory params = INonfungiblePositionManager
                .DecreaseLiquidityParams({
                    tokenId: tokenId,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                });

        (amount0, amount1) = nonfungiblePositionManager.decreaseLiquidity(
            params
        );
    }
}
