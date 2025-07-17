// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/**
 * @title Constants
 * @notice Defines protocol-wide constant addresses for mainnet token contracts
 * @dev Contains immutable addresses for USDT and aUSDT on Ethereum mainnet
 */
abstract contract Constants {
    //########################################## CONSTANT ##########################################

    ///@notice USDT eth mainnet contract address
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    ///@notice aUSDT eth mainnet contract address
    address public constant AUSDT = 0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a;
}
