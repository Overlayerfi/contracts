// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OverlayerOriginNFT} from "./OverlayerOriginNFT.sol";

/// @title OverlayerOriginShrimp
/// @notice The Shrimp tier standalone Overlayer Origin NFT collection.
contract OverlayerOriginShrimp is OverlayerOriginNFT {
    struct DeploymentConfig {
        address initialOwner;
        string baseURI;
        address royaltyReceiver;
        uint96 royaltyFeeNumerator;
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
            payable(address(0)),
            0,
            0,
            0,
            config_.maxSupply,
            config_.bonusNumerator,
            config_.mintStartTime,
            config_.mintStartTime + WHITELIST_MINT_DURATION,
            0
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
