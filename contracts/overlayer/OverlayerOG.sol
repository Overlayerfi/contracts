// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {OverlayerOriginNFT} from "./OverlayerOriginNFT.sol";

/// @title OverlayerOG
/// @notice An allowlisted Overlayer OG collection that is mint-only (non-transferable, non-burnable).
/// @dev Paid Merkle mints cost {MINT_PRICE} during a 14-day window. A separate free-mint Merkle
///      root allows zero-price claims. After minting ends, the fixed holder set is loaded onto
///      spoke Liquidity farms via the same `setMerkleRoot` task used for Origin NFTs.
contract OverlayerOG is OverlayerOriginNFT {
    /// @notice Lifetime maximum number of OG NFTs that may be minted.
    uint256 public constant MAX_SUPPLY = 2_000;

    /// @notice Fixed ETH price charged to paid-allowlist minters.
    uint256 public constant MINT_PRICE = 0.005 ether;

    /// @notice Merkle root for the scalable free-mint allowlist; zero disables proof-based free mints.
    bytes32 public freeMintMerkleRoot;

    /// @notice Emitted when the scalable free-mint allowlist root changes.
    event FreeMintMerkleRootUpdated(bytes32 indexed merkleRoot);

    /// @notice Reverts when attempting to transfer an OG NFT between accounts.
    error NonTransferable();

    /// @notice Reverts when attempting to burn an OG NFT.
    error NonBurnable();

    constructor(
        address initialOwner_,
        string memory baseURI_,
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        address payable feeCollector_,
        uint256 mintStartTime_
    )
        OverlayerOriginNFT(
            "Overlayer OG",
            "Overlayer OG",
            initialOwner_,
            baseURI_,
            royaltyReceiver_,
            royaltyFeeNumerator_,
            feeCollector_,
            MINT_PRICE,
            0,
            1,
            MAX_SUPPLY,
            0,
            mintStartTime_,
            mintStartTime_ + WHITELIST_MINT_DURATION,
            0
        )
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /**
     * @notice Replaces the Merkle root used by {mintWithFreeMintProof}.
     * @dev Replacing the root never resets {hasMinted}; set the root to zero to disable proof-based free mints.
     * @param merkleRoot_ Root generated from the eligible addresses.
     */
    function setFreeMintMerkleRoot(bytes32 merkleRoot_) external onlyOwner {
        freeMintMerkleRoot = merkleRoot_;
        emit FreeMintMerkleRootUpdated(merkleRoot_);
    }

    /**
     * @notice Mints the caller's sole primary NFT using a free-mint Merkle allowlist proof.
     * @dev The leaf encoding matches {mintWithProof}. The caller pays zero regardless of {mintPrice}.
     * @param proof_ Sorted Merkle sibling hashes proving the caller is in {freeMintMerkleRoot}.
     * @return tokenId The newly minted token ID.
     */
    function mintWithFreeMintProof(
        bytes32[] calldata proof_
    ) external payable whenNotPaused whenMintOpen returns (uint256 tokenId) {
        if (!isFreeMintMerkleWhitelisted(msg.sender, proof_)) {
            revert InvalidMerkleProof();
        }

        return _claimFreeMint(msg.sender);
    }

    /**
     * @notice Returns whether an address is included in the active free-mint Merkle allowlist.
     * @param account_ Address whose membership is being checked.
     * @param proof_ Sorted Merkle sibling hashes for the address.
     */
    function isFreeMintMerkleWhitelisted(
        address account_,
        bytes32[] calldata proof_
    ) public view returns (bool) {
        return
            freeMintMerkleRoot != bytes32(0) &&
            MerkleProof.verifyCalldata(
                proof_,
                freeMintMerkleRoot,
                merkleLeaf(account_)
            );
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

    function _claimFreeMint(
        address account_
    ) private returns (uint256 tokenId) {
        if (hasMinted[account_]) revert AlreadyMinted();
        if (maxSupply != 0 && nextTokenId > maxSupply) {
            revert MaxSupplyReached(maxSupply);
        }

        tokenId = nextTokenId;
        unchecked {
            nextTokenId = tokenId + 1;
        }
        hasMinted[account_] = true;

        _safeMint(account_, tokenId);
        emit Minted(account_, tokenId);

        if (msg.value != 0) {
            (bool success, ) = payable(account_).call{value: msg.value}("");
            if (!success) revert RefundFailed();

            emit MintPaymentRefunded(account_, msg.value);
        }
    }
}
