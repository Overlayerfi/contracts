// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICurveStableSwapPool {
    function add_liquidity(
        uint256[2] memory amounts,
        uint256 min_mint_amount
    ) external;
    function get_virtual_price() external returns (uint256);
}

interface ICurveStableSwapTriPool {
    function add_liquidity(
        uint256[3] memory amounts,
        uint256 min_mint_amount
    ) external;
    function get_virtual_price() external returns (uint256);
}

contract CurveLiquidityProxy {
    using SafeERC20 for IERC20;

    function addStableSwap(
        ICurveStableSwapPool pool,
        IERC20 lp,
        IERC20 token0,
        IERC20 token1,
        uint256 amount0,
        uint256 amount1
    ) external {
        require(
            token0.transferFrom(msg.sender, address(this), amount0),
            "CurveLiquidityProxy::addStableSwap: can not transfer amount0"
        );
        require(
            token1.transferFrom(msg.sender, address(this), amount1),
            "CurveLiquidityProxy::addStableSwap: can not transfer amount1"
        );

        uint256[2] memory amounts = [amount0, amount1];
        pool.add_liquidity(amounts, 0);

        require(
            lp.balanceOf(address(this)) > 0,
            "CurveLiquidityProxy::addStableSwap: No lp collected"
        );

        lp.transfer(msg.sender, lp.balanceOf(address(this)));
    }

    /// @dev This works only for https://etherscan.io/address/0xbebc44782c7db0a1a60cb6fe97d0b483032ff1c7#readContract
    /// @dev User must send the amounts to this contract first
    /// @param pool The Curve fi pool
    /// @param lp The Curve fi liquidity pool token
    /// @param token0 DAI address
    /// @param token1 USDC address
    /// @param token2 USDT address
    /// @param amount0 DAI amount
    /// @param amount1 USDC amount
    /// @param amount2 USDT amount
    function addTriStableSwap(
        ICurveStableSwapTriPool pool,
        IERC20 lp,
        IERC20 token0,
        IERC20 token1,
        IERC20 token2,
        uint256 amount0,
        uint256 amount1,
        uint256 amount2
    ) external {
        token0.safeIncreaseAllowance(
            address(pool),
            token0.balanceOf(address(this))
        );
        token1.safeIncreaseAllowance(
            address(pool),
            token1.balanceOf(address(this))
        );
        token2.safeIncreaseAllowance(
            address(pool),
            token2.balanceOf(address(this))
        );

        uint256[3] memory amounts = [amount0, amount1, amount2];
        pool.add_liquidity(amounts, 0);

        require(
            lp.balanceOf(address(this)) > 0,
            "CurveLiquidityProxy::addStableSwap: No lp collected"
        );

        lp.transfer(msg.sender, lp.balanceOf(address(this)));
    }
}
