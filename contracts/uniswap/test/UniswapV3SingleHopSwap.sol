// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../interfaces/ISwapRouter02.sol";
import {IWETH} from "../interfaces/IWETH.sol";

address constant SWAP_ROUTER_02 = 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
address constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
address constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
address constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
uint24 constant FEE = 3000;

/// @title Proxy to handle UniV3 swaps by communicating with the swap router v2
/// @dev This a test helper contract. Do not use in prod
contract UniswapV3SingleHopSwap {
    ISwapRouter02 private constant router = ISwapRouter02(SWAP_ROUTER_02);
    IERC20 private constant weth = IERC20(WETH);

    function swapExactInputSingleHop(
        uint256 amountIn,
        uint256 amountOutMin,
        uint8 code
    ) external {
        weth.transferFrom(msg.sender, address(this), amountIn);
        weth.approve(address(router), amountIn);

        address outAddress = DAI;
        if (code == 1) {
            outAddress = USDC;
        }
        if (code == 2) {
            outAddress = USDT;
        }

        ISwapRouter02.ExactInputSingleParams memory params = ISwapRouter02
            .ExactInputSingleParams({
                tokenIn: WETH,
                tokenOut: outAddress,
                fee: FEE,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: amountOutMin,
                sqrtPriceLimitX96: 0
            });

        router.exactInputSingle(params);
    }

    function swapExactOutputSingleHop(
        uint256 amountOut,
        uint256 amountInMax,
        uint8 code
    ) external {
        weth.transferFrom(msg.sender, address(this), amountInMax);
        weth.approve(address(router), amountInMax);

        address outAddress = DAI;
        if (code == 1) {
            outAddress = USDC;
        }
        if (code == 2) {
            outAddress = USDT;
        }

        ISwapRouter02.ExactOutputSingleParams memory params = ISwapRouter02
            .ExactOutputSingleParams({
                tokenIn: WETH,
                tokenOut: DAI,
                fee: FEE,
                recipient: msg.sender,
                amountOut: amountOut,
                amountInMaximum: amountInMax,
                sqrtPriceLimitX96: 0
            });

        uint256 amountIn = router.exactOutputSingle(params);

        if (amountIn < amountInMax) {
            weth.approve(address(router), 0);
            weth.transfer(msg.sender, amountInMax - amountIn);
        }
    }
}
