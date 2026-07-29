// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title OverlayerOriginNFT
 * @notice Shared implementation for an allowlisted, one-time-mint ERC-721 collection.
 * @dev Mint eligibility is intentionally local to each chain deployment.
 */
abstract contract OverlayerOriginNFT is ERC721, ERC2981, Ownable, Pausable {
    /// @notice Maximum default royalty in basis points.
    uint96 public constant MAX_ROYALTY_BPS = 1_000;

    /// @notice Duration of the initial whitelist-only mint phase for tier collections.
    uint256 public constant WHITELIST_MINT_DURATION = 14 days;

    /// @notice Addresses eligible to mint during whitelist-only phases on this chain.
    mapping(address => bool) public whitelisted;

    /// @notice Addresses eligible for a zero-price primary mint on this chain.
    /// @dev Free mints still consume the next sequential token ID and price tier.
    mapping(address => bool) public freeMintWhitelisted;

    /// @notice Whether an address has already performed its one primary mint on this chain.
    mapping(address => bool) public hasMinted;

    /// @notice The ID assigned to the next primary mint.
    uint256 public nextTokenId = 1;

    /// @notice Merkle root for the scalable allowlist; zero disables proof-based mints.
    bytes32 public merkleRoot;

    /// @notice Wallet receiving ETH paid for primary mints; zero for free collections.
    address payable public immutable feeCollector;

    /// @notice Mint price charged for token IDs in the first pricing unit.
    uint256 public immutable initialMintPrice;

    /// @notice Price added after every completed pricing unit.
    uint256 public immutable priceIncrement;

    /// @notice Number of token IDs sold at each price level.
    uint256 public immutable priceUnitDelta;

    /// @notice Maximum number of primary NFTs that can ever be minted; zero disables the cap.
    uint256 public immutable maxSupply;

    /// @notice Numerator of the collection's exact bonus fraction.
    uint256 public immutable bonusNumerator;

    /// @notice Denominator of the collection's exact bonus fraction, fixed at 100.
    uint256 public immutable bonusDenominator;

    /// @notice Unix timestamp at which allowlisted users can begin minting.
    uint256 public immutable mintStartTime;

    /// @notice Unix timestamp at which all primary mints end; zero disables the deadline.
    uint256 public immutable mintEndTime;

    /// @notice Unix timestamp at which direct mints become public until {mintEndTime}; zero keeps direct mints allowlisted.
    uint256 public immutable publicMintStartTime;

    string private _baseTokenURI;

    /// @notice Emitted when an address's allowlist status changes.
    event WhitelistUpdated(address indexed account, bool isWhitelisted);

    /// @notice Emitted when an address's free-mint eligibility changes.
    event FreeMintWhitelistUpdated(
        address indexed account,
        bool isFreeMintWhitelisted
    );

    /// @notice Emitted after an eligible address mints its only primary token.
    event Minted(address indexed account, uint256 indexed tokenId);

    /// @notice Emitted when the base token URI changes.
    event BaseURIUpdated(string baseURI);

    /// @notice Emitted when default secondary-sale royalty terms change.
    event RoyaltyUpdated(address indexed receiver, uint96 feeNumerator);

    /// @notice Emitted when the scalable allowlist root changes.
    event MerkleRootUpdated(bytes32 indexed merkleRoot);

    /// @notice Emitted after a paid primary mint forwards ETH to the fee collector.
    event MintPaymentCollected(
        address indexed minter,
        address indexed feeCollector,
        uint256 amount
    );

    /// @notice Emitted after a paid mint returns excess ETH to the minter.
    event MintPaymentRefunded(address indexed minter, uint256 amount);

    /// @notice Reverts when an address is not allowed to mint.
    error NotWhitelisted();

    /// @notice Reverts when an address has already minted from this collection.
    error AlreadyMinted();

    /// @notice Reverts when an allowlist address is the zero address.
    error ZeroAddress();

    /// @notice Reverts when the royalty receiver and fee are configured inconsistently.
    error InvalidRoyaltyConfiguration();

    /// @notice Reverts when a royalty fee exceeds the collection maximum.
    error RoyaltyFeeTooHigh(uint96 feeNumerator);

    /// @notice Reverts when a caller cannot prove membership in the active Merkle allowlist.
    error InvalidMerkleProof();

    /// @notice Reverts when paid-mint pricing parameters are inconsistent.
    error InvalidMintPricing();

    /// @notice Reverts when a caller does not provide at least the active mint price.
    error InsufficientMintPayment(uint256 expected, uint256 received);

    /// @notice Reverts when the configured fee collector rejects a mint payment.
    error FeeTransferFailed();

    /// @notice Reverts when returning excess ETH to the minter fails.
    error RefundFailed();

    /// @notice Reverts when a caller requests a price for token ID zero.
    error InvalidTokenId();

    /// @notice Reverts when every token ID in the collection has been minted.
    error MaxSupplyReached(uint256 maxSupply);

    /// @notice Reverts when minting is attempted before {mintStartTime}.
    error MintNotStarted(uint256 mintStartTime, uint256 currentTime);

    /// @notice Reverts when minting is attempted at or after {mintEndTime}.
    error MintEnded(uint256 mintEndTime, uint256 currentTime);

    /// @notice Reverts when a mint-window configuration is internally inconsistent.
    error InvalidMintSchedule();

    /**
     * @param name_ Collection name.
     * @param symbol_ Collection symbol.
     * @param initialOwner_ Owner allowed to administer the collection.
     * @param baseURI_ Base URI used by {tokenURI}.
     * @param royaltyReceiver_ Initial royalty recipient; use the zero address when no royalty is configured.
     * @param royaltyFeeNumerator_ Initial royalty in basis points.
     * @param feeCollector_ Recipient of ETH paid for primary mints; use zero for a free collection.
     * @param initialMintPrice_ Price for the first {priceUnitDelta_} token IDs.
     * @param priceIncrement_ Price added after each complete pricing unit.
     * @param priceUnitDelta_ Number of token IDs per price level.
     * @param maxSupply_ Maximum primary NFTs that can ever be minted; use zero for no cap.
     * @param bonusNumerator_ Numerator of the collection's exact bonus fraction.
     * @param mintStartTime_ Unix timestamp at which allowlisted users can begin minting.
     * @param mintEndTime_ Unix timestamp at which all primary mints end; use zero for no deadline.
     * @param publicMintStartTime_ Unix timestamp at which direct mints become public until {mintEndTime}; use zero for never.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_,
        string memory baseURI_,
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        address payable feeCollector_,
        uint256 initialMintPrice_,
        uint256 priceIncrement_,
        uint256 priceUnitDelta_,
        uint256 maxSupply_,
        uint256 bonusNumerator_,
        uint256 mintStartTime_,
        uint256 mintEndTime_,
        uint256 publicMintStartTime_
    ) ERC721(name_, symbol_) Ownable(initialOwner_) {
        bool hasMintPricing = initialMintPrice_ != 0 || priceIncrement_ != 0;
        if (
            (hasMintPricing &&
                (feeCollector_ == address(0) || priceUnitDelta_ == 0)) ||
            (!hasMintPricing &&
                (feeCollector_ != address(0) || priceUnitDelta_ != 0))
        ) {
            revert InvalidMintPricing();
        }
        if (
            (mintEndTime_ != 0 && mintEndTime_ <= mintStartTime_) ||
            (publicMintStartTime_ != 0 &&
                publicMintStartTime_ < mintStartTime_) ||
            (mintEndTime_ != 0 &&
                publicMintStartTime_ != 0 &&
                publicMintStartTime_ >= mintEndTime_)
        ) {
            revert InvalidMintSchedule();
        }

        _baseTokenURI = baseURI_;
        feeCollector = feeCollector_;
        initialMintPrice = initialMintPrice_;
        priceIncrement = priceIncrement_;
        priceUnitDelta = priceUnitDelta_;
        maxSupply = maxSupply_;
        bonusNumerator = bonusNumerator_;
        bonusDenominator = 100;
        mintStartTime = mintStartTime_;
        mintEndTime = mintEndTime_;
        publicMintStartTime = publicMintStartTime_;

        if (royaltyReceiver_ != address(0) || royaltyFeeNumerator_ != 0) {
            _setRoyalty(royaltyReceiver_, royaltyFeeNumerator_);
        }
    }

    /// @dev Restricts primary mints to the configured mint window.
    modifier whenMintOpen() {
        if (block.timestamp < mintStartTime) {
            revert MintNotStarted(mintStartTime, block.timestamp);
        }
        if (mintEndTime != 0 && block.timestamp >= mintEndTime) {
            revert MintEnded(mintEndTime, block.timestamp);
        }
        _;
    }

    /**
     * @notice Updates one address's eligibility to mint.
     * @param account_ Address whose eligibility is changing.
     * @param isWhitelisted_ New eligibility status.
     */
    function setWhitelist(
        address account_,
        bool isWhitelisted_
    ) external onlyOwner {
        _setWhitelist(account_, isWhitelisted_);
    }

    /**
     * @notice Updates the eligibility of multiple addresses.
     * @param accounts_ Addresses whose eligibility is changing.
     * @param isWhitelisted_ New eligibility status for every address.
     */
    function batchSetWhitelist(
        address[] calldata accounts_,
        bool isWhitelisted_
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts_.length; ++i) {
            _setWhitelist(accounts_[i], isWhitelisted_);
        }
    }

    /**
     * @notice Updates one address's zero-price mint eligibility.
     * @dev Free-mint eligibility also allows direct minting during a whitelist-only phase.
     * @param account_ Address whose free-mint eligibility is changing.
     * @param isFreeMintWhitelisted_ New free-mint eligibility status.
     */
    function setFreeMintWhitelist(
        address account_,
        bool isFreeMintWhitelisted_
    ) external onlyOwner {
        _setFreeMintWhitelist(account_, isFreeMintWhitelisted_);
    }

    /**
     * @notice Updates zero-price mint eligibility for multiple addresses.
     * @dev Free-mint eligibility also allows direct minting during a whitelist-only phase.
     * @param accounts_ Addresses whose free-mint eligibility is changing.
     * @param isFreeMintWhitelisted_ New free-mint eligibility status for every address.
     */
    function batchSetFreeMintWhitelist(
        address[] calldata accounts_,
        bool isFreeMintWhitelisted_
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts_.length; ++i) {
            _setFreeMintWhitelist(accounts_[i], isFreeMintWhitelisted_);
        }
    }

    /**
     * @notice Mints the caller's sole primary NFT for this collection on this chain.
     * @dev Direct mints are allowlisted until {publicMintStartTime}, when configured.
     * @return tokenId The newly minted token ID.
     */
    function mint()
        external
        payable
        whenNotPaused
        whenMintOpen
        returns (uint256 tokenId)
    {
        if (
            !isPublicMintOpen() &&
            !whitelisted[msg.sender] &&
            !freeMintWhitelisted[msg.sender]
        ) {
            revert NotWhitelisted();
        }

        return _claimMint(msg.sender);
    }

    /**
     * @notice Mints the caller's sole primary NFT using a Merkle allowlist proof.
     * @dev The leaf is `keccak256(bytes.concat(keccak256(abi.encode(account))))`.
     * @param proof_ Sorted Merkle sibling hashes proving the caller is in {merkleRoot}.
     * @return tokenId The newly minted token ID.
     */
    function mintWithProof(
        bytes32[] calldata proof_
    ) external payable whenNotPaused whenMintOpen returns (uint256 tokenId) {
        if (!isMerkleWhitelisted(msg.sender, proof_)) {
            revert InvalidMerkleProof();
        }

        return _claimMint(msg.sender);
    }

    /**
     * @notice Burns a token owned by the caller or for which the caller is approved.
     * @dev This enables an approved future redemption contract to atomically consume source NFTs.
     * @param tokenId_ Token ID to burn.
     */
    function burn(uint256 tokenId_) external {
        _burnToken(tokenId_);
    }

    /**
     * @notice Burns multiple tokens owned by the caller or for which the caller is approved.
     * @dev Reverts atomically if any token does not exist or the caller is not authorized for it.
     * @param tokenIds_ Token IDs to burn.
     */
    function burnBatch(uint256[] calldata tokenIds_) external {
        for (uint256 i = 0; i < tokenIds_.length; ++i) {
            _burnToken(tokenIds_[i]);
        }
    }

    /**
     * @notice Replaces the Merkle root used by {mintWithProof}.
     * @dev Replacing the root never resets {hasMinted}; set the root to zero to disable proof-based mints.
     * @param merkleRoot_ Root generated from the eligible addresses.
     */
    function setMerkleRoot(bytes32 merkleRoot_) external onlyOwner {
        merkleRoot = merkleRoot_;
        emit MerkleRootUpdated(merkleRoot_);
    }

    /**
     * @notice Updates the base URI used to resolve token metadata.
     * @param baseURI_ New base URI.
     */
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BaseURIUpdated(baseURI_);
    }

    /**
     * @notice Sets the default marketplace-readable secondary-sale royalty.
     * @param receiver_ Recipient of the royalty payment.
     * @param feeNumerator_ Royalty in basis points.
     */
    function setRoyalty(
        address receiver_,
        uint96 feeNumerator_
    ) external onlyOwner {
        _setRoyalty(receiver_, feeNumerator_);
    }

    /// @notice Clears the default marketplace-readable secondary-sale royalty.
    function clearRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
        emit RoyaltyUpdated(address(0), 0);
    }

    /// @notice Pauses direct and Merkle allowlist mints.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes direct and Merkle allowlist mints.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Returns the exact ETH amount required to mint the next token ID.
    function mintPrice() public view returns (uint256) {
        return mintPriceForTokenId(nextTokenId);
    }

    /**
     * @notice Returns the exact ETH amount an account must pay to mint the next token ID.
     * @dev A free-mint allowlisted account pays zero but still advances {nextTokenId}.
     * @param account_ Address requesting the primary mint.
     */
    function mintPriceForAccount(
        address account_
    ) public view returns (uint256) {
        return freeMintWhitelisted[account_] ? 0 : mintPrice();
    }

    /// @notice Returns the collection's exact bonus fraction.
    function bonus()
        public
        view
        returns (uint256 numerator, uint256 denominator)
    {
        return (bonusNumerator, bonusDenominator);
    }

    /// @notice Returns whether direct mints are currently open to every address.
    function isPublicMintOpen() public view returns (bool) {
        return
            publicMintStartTime != 0 &&
            block.timestamp >= publicMintStartTime &&
            (mintEndTime == 0 || block.timestamp < mintEndTime);
    }

    /**
     * @notice Returns the price applicable to a given token ID.
     * @dev IDs 1 through {priceUnitDelta} use {initialMintPrice}; the next unit adds {priceIncrement}.
     * @param tokenId_ Token ID whose primary mint price is being queried.
     */
    function mintPriceForTokenId(
        uint256 tokenId_
    ) public view returns (uint256) {
        if (tokenId_ == 0) revert InvalidTokenId();
        if (initialMintPrice == 0 && priceIncrement == 0) return 0;

        return
            initialMintPrice +
            (((tokenId_ - 1) / priceUnitDelta) * priceIncrement);
    }

    /**
     * @notice Returns whether an address is included in the active Merkle allowlist.
     * @param account_ Address whose membership is being checked.
     * @param proof_ Sorted Merkle sibling hashes for the address.
     */
    function isMerkleWhitelisted(
        address account_,
        bytes32[] calldata proof_
    ) public view returns (bool) {
        return
            merkleRoot != bytes32(0) &&
            MerkleProof.verifyCalldata(
                proof_,
                merkleRoot,
                merkleLeaf(account_)
            );
    }

    /// @inheritdoc ERC721
    function supportsInterface(
        bytes4 interfaceId_
    ) public view virtual override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId_);
    }

    /**
     * @notice Computes the double-hashed leaf used by the Merkle allowlist.
     * @param account_ Address to encode as an allowlist leaf.
     */
    function merkleLeaf(address account_) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account_))));
    }

    /// @inheritdoc ERC721
    function _baseURI() internal view virtual override returns (string memory) {
        return _baseTokenURI;
    }

    function _setWhitelist(address account_, bool isWhitelisted_) private {
        if (account_ == address(0)) revert ZeroAddress();

        whitelisted[account_] = isWhitelisted_;
        emit WhitelistUpdated(account_, isWhitelisted_);
    }

    function _setFreeMintWhitelist(
        address account_,
        bool isFreeMintWhitelisted_
    ) private {
        if (account_ == address(0)) revert ZeroAddress();

        freeMintWhitelisted[account_] = isFreeMintWhitelisted_;
        emit FreeMintWhitelistUpdated(account_, isFreeMintWhitelisted_);
    }

    function _burnToken(uint256 tokenId_) private {
        _update(address(0), tokenId_, _msgSender());
    }

    function _claimMint(address account_) private returns (uint256 tokenId) {
        if (hasMinted[account_]) revert AlreadyMinted();
        if (maxSupply != 0 && nextTokenId > maxSupply) {
            revert MaxSupplyReached(maxSupply);
        }

        uint256 price = mintPriceForAccount(account_);
        if (msg.value < price) {
            revert InsufficientMintPayment(price, msg.value);
        }

        tokenId = nextTokenId;
        unchecked {
            nextTokenId = tokenId + 1;
        }
        hasMinted[account_] = true;

        _safeMint(account_, tokenId);
        emit Minted(account_, tokenId);

        if (price != 0) {
            (bool success, ) = feeCollector.call{value: price}("");
            if (!success) revert FeeTransferFailed();

            emit MintPaymentCollected(account_, feeCollector, price);
        }

        uint256 refund = msg.value - price;
        if (refund != 0) {
            (bool success, ) = payable(account_).call{value: refund}("");
            if (!success) revert RefundFailed();

            emit MintPaymentRefunded(account_, refund);
        }
    }

    function _setRoyalty(address receiver_, uint96 feeNumerator_) private {
        if (receiver_ == address(0)) revert InvalidRoyaltyConfiguration();
        if (feeNumerator_ > MAX_ROYALTY_BPS) {
            revert RoyaltyFeeTooHigh(feeNumerator_);
        }

        _setDefaultRoyalty(receiver_, feeNumerator_);
        emit RoyaltyUpdated(receiver_, feeNumerator_);
    }
}
