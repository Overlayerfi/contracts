// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/**
 * @title Constants
 * @notice Define utils constants
 */
abstract contract Constants
{
    //########################################## CONSTANT ##########################################

    ///@notice USDC eth mainnet contract address
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    ///@notice USDT eth mainnet contract address
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    ///@notice aUSDC eth mainnet contract address
    address public constant AUSDC = 0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c;
    ///@notice aUSDT eth mainnet contract address
    address public constant AUSDT = 0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a;
    ///@notice WETH eth mainnet contract address
    address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    ///@notice aWETH eth mainnet contract address
    address public constant AWETH = 0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8;
    ///@notice Uniswap SwapRouterV2
    address public constant UNI_SWAP_ROUTER_V2 =  0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45;
    ///@notice Uniswap QuoterV2
    address public constant UNI_QUOTER_V2 = 0x61fFE014bA17989E743c5F6cB21bF9697530B21e;
}
