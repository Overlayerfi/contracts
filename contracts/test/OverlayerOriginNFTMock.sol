// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OverlayerOriginNFT} from "../overlayer/OverlayerOriginNFT.sol";

/// @dev Minimal configurable collection used to test shared Origin NFT behavior.
contract OverlayerOriginNFTMock is OverlayerOriginNFT {
    constructor(
        uint256 maxSupply_
    )
        OverlayerOriginNFT(
            "Overlayer Origin NFT Mock",
            "ORIGIN-MOCK",
            msg.sender,
            "",
            address(0),
            0,
            payable(address(0)),
            0,
            0,
            0,
            maxSupply_,
            0,
            0,
            0,
            0
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
