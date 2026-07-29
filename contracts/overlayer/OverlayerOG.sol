// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OverlayerOriginNFT} from "./OverlayerOriginNFT.sol";

/// @title OverlayerOG
/// @notice A free, allowlisted Overlayer OG collection whose NFTs cannot be transferred.
contract OverlayerOG is OverlayerOriginNFT {
    /// @notice Lifetime maximum number of OG NFTs that may be minted.
    uint256 public constant MAX_SUPPLY = 2_000;

    /// @notice Reverts when attempting to transfer an OG NFT between accounts.
    error NonTransferable();

    constructor(
        address initialOwner_,
        string memory baseURI_,
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        uint256 mintStartTime_
    )
        OverlayerOriginNFT(
            "Overlayer OG",
            "Overlayer OG",
            initialOwner_,
            baseURI_,
            royaltyReceiver_,
            royaltyFeeNumerator_,
            payable(address(0)),
            0,
            0,
            0,
            MAX_SUPPLY,
            0,
            mintStartTime_,
            0,
            0
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /// @dev Allows minting and burning, but rejects ownership changes between accounts.
    function _update(
        address to_,
        uint256 tokenId_,
        address auth_
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId_);
        if (from != address(0) && to_ != address(0)) {
            revert NonTransferable();
        }

        return super._update(to_, tokenId_, auth_);
    }
}
