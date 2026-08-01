// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OverlayerOriginNFT} from "./OverlayerOriginNFT.sol";

/// @title OverlayerOriginShrimpRobinHood
/// @notice Paid Shrimp tier for Robinhood Chain with the same whitelist + public
///         schedule as Dolphin/Whale. ERC-721 name/symbol remain Overlayer Origin Shrimp.
contract OverlayerOriginShrimpRobinHood is OverlayerOriginNFT {
    struct DeploymentConfig {
        address initialOwner;
        string baseURI;
        address royaltyReceiver;
        uint96 royaltyFeeNumerator;
        address payable feeCollector;
        uint256 initialMintPrice;
        uint256 priceIncrement;
        uint256 priceUnitDelta;
        uint256 maxSupply;
        uint256 bonusNumerator;
        uint256 mintStartTime;
    }

    constructor(
        DeploymentConfig memory config_
    )
        OverlayerOriginNFT(
            "Overlayer Origin Shrimp",
            "Overlayer Origin Shrimp",
            config_.initialOwner,
            config_.baseURI,
            config_.royaltyReceiver,
            config_.royaltyFeeNumerator,
            config_.feeCollector,
            config_.initialMintPrice,
            config_.priceIncrement,
            config_.priceUnitDelta,
            config_.maxSupply,
            config_.bonusNumerator,
            config_.mintStartTime,
            config_.mintStartTime + (2 * WHITELIST_MINT_DURATION),
            config_.mintStartTime + WHITELIST_MINT_DURATION
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
