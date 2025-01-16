// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/**
 * @title Constants
 * @notice Define utils constants
 */
abstract contract Constants {
    //########################################## CONSTANT ##########################################

    ///@notice USDC eth sepolia contract address
    address public constant USDC = 0x85c9aC190c8153aBa227FD9Cb236d2261B60996c;
    ///@notice USDT eth sepolia contract address
    address public constant USDT = 0xDD4ED73e1aF352a73180E4e9432246100827e3db;
    ///@notice aUSDC eth sepolia contract address
    address public constant AUSDC = 0x16dA4541aD1807f4443d92D26044C1147406EB80;
    ///@notice aUSDT eth sepolia contract address
    address public constant AUSDT = 0xAF0F6e8b0Dc5c913bbF4d14c22B4E78Dd14310B6;
    ///@notice WETH eth sepolia contract address
    address constant WETH = 0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c;
    ///@notice aWETH eth sepolia contract address
    address public constant AWETH = 0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830;
    ///@notice Uniswap eth sepolia SwapRouterV2
    address public constant UNI_SWAP_ROUTER_V2 =
        0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    ///@notice Uniswap eth sepolia QuoterV2
    address public constant UNI_QUOTER_V2 =
        0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3;
}
