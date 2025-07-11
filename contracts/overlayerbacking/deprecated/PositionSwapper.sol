// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PositionSwapperParams} from "./PositionSwapperParams.sol";

/**
 * @title Uniswap Swap Router v2
 */
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    function exactOutputSingle(
        ExactOutputSingleParams calldata params
    ) external payable returns (uint256 amountIn);
}

/**
 * @title PositionSwapper
 * @notice This contract works as a helper utility for AaveHandler to swap Aave
 * positions. This usage won't affect the security of user's funds as the new position
 * will still belong to the backing contract.
 */
abstract contract PositionSwapper {
    using SafeERC20 for IERC20;
    using Math for uint256;

    //########################################## CONSTANTS ##########################################
    // https://docs.uniswap.org/concepts/protocol/fees
    uint24 private constant FEE = 3000;

    //########################################## ERRORS ##########################################
    error SwapUniswapInsufficientBalance();
    error SwapUniswapAaveWithdrawFailed();

    //########################################## PRIVATE FUNCTIONS ##########################################

    ///@notice Executes a swap on Uniswap router.
    ///@param router The router address
    ///@param amountFrom The amount of the input token
    ///@param amountToMin The min amount to receive from the swap
    ///@param from The input token
    ///@param to The output token
    ///@param sqrtPriceLimitX96 The sqrtPriceLimitX96 value
    function _swapExactInputSingleHop(
        address router,
        uint256 amountFrom,
        uint256 amountToMin,
        address from,
        address to,
        uint160 sqrtPriceLimitX96
    ) private {
        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02
            .ExactInputSingleParams({
                tokenIn: from,
                tokenOut: to,
                fee: FEE,
                recipient: address(this),
                amountIn: amountFrom,
                amountOutMinimum: amountToMin,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            });

        ISwapRouter02(router).exactInputSingle(params);
    }

    ///@notice Compute the right sqrtPriceLimitX96 for UniV3
    ///@dev Disabled as the current contract will be used in an emergency call, ignore market conditions
    ///But for ref: (https://ethereum.stackexchange.com/questions/140992/how-to-calculate-sqrtpricelimitx96-in-production)
    ///@return The limit price
    function _getSqrtPriceLimitX96() private pure returns (uint160) {
        return 0;
    }

    //########################################## INTERNAL FUNCTIONS ##########################################

    ///@notice Swap all the aUSDC, aUSDT position into aWETH.
    ///@param params A PositionSwapperParams struct containing all the needed swap informations
    ///@return The amount of out token put back into Aave
    function _swap(
        PositionSwapperParams memory params
    ) internal returns (uint256) {
        if (IERC20(params.ausdc).balanceOf(address(this)) < params.amountUsdc)
            revert SwapUniswapInsufficientBalance();
        if (IERC20(params.ausdt).balanceOf(address(this)) < params.amountUsdt)
            revert SwapUniswapInsufficientBalance();

        uint256 usdcReceived = 0;
        uint256 usdtReceived = 0;
        // Retrieve position from Aave
        if (params.amountUsdc > 0) {
            usdcReceived = IPool(params.aavePool).withdraw(
                params.usdc,
                params.amountUsdc,
                address(this)
            );
        }
        if (params.amountUsdt > 0) {
            usdtReceived = IPool(params.aavePool).withdraw(
                params.usdt,
                params.amountUsdt,
                address(this)
            );
        }
        // Correctness check
        if (
            (params.amountUsdc != usdcReceived) ||
            (params.amountUsdt != usdtReceived)
        ) {
            revert SwapUniswapAaveWithdrawFailed();
        }

        // Swap for WETH
        if (params.amountUsdc > 0) {
            uint160 sqrtLimitPrice = _getSqrtPriceLimitX96();
            IERC20(params.usdc).forceApprove(params.router, params.amountUsdc);
            _swapExactInputSingleHop(
                params.router,
                params.amountUsdc,
                1,
                params.usdc,
                params.outToken,
                sqrtLimitPrice
            );
        }
        if (params.amountUsdt > 0) {
            uint160 sqrtLimitPrice = _getSqrtPriceLimitX96();
            IERC20(params.usdt).forceApprove(params.router, params.amountUsdt);
            _swapExactInputSingleHop(
                params.router,
                params.amountUsdt,
                1,
                params.usdt,
                params.outToken,
                sqrtLimitPrice
            );
        }

        uint256 amountOut = IERC20(params.outToken).balanceOf(address(this));

        // Now put WETH back to work
        IERC20(params.outToken).forceApprove(params.aavePool, amountOut);
        IPool(params.aavePool).supply(
            params.outToken,
            amountOut,
            params.beneficiary,
            params.aaveRefCode
        );

        return amountOut;
    }
}
