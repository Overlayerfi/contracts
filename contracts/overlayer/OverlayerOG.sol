// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {OverlayerOriginNFT} from "./OverlayerOriginNFT.sol";

/// @title OverlayerOG
/// @notice A free, allowlisted Overlayer OG collection that is mint-only (non-transferable, non-burnable).
/// @dev Permanent Eth holdings keep spoke OG entitlement badges in sync after a one-time `sync` per chain.
contract OverlayerOG is OverlayerOriginNFT {
    /// @notice Lifetime maximum number of OG NFTs that may be minted.
    uint256 public constant MAX_SUPPLY = 2_000;

    /// @notice Reverts when attempting to transfer an OG NFT between accounts.
    error NonTransferable();

    /// @notice Reverts when attempting to burn an OG NFT.
    error NonBurnable();

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

    /// @dev Mint-only: allow mint (from == 0); block peer transfers and burns (to == 0).
    function _update(
        address to_,
        uint256 tokenId_,
        address auth_
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId_);
        if (from != address(0) && to_ != address(0)) {
            revert NonTransferable();
        }
        if (from != address(0) && to_ == address(0)) {
            revert NonBurnable();
        }

        return super._update(to_, tokenId_, auth_);
    }
}
