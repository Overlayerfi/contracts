// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import '../shared/SingleAdminAccessControl.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

import '../token/interfaces/IUSDO.sol';
import './interfaces/IMintRedeem.sol';

/**
 * @title USDO Minting
 * @notice This contract mints and redeems USDO
 */
contract MintRedeem is IMintRedeem, SingleAdminAccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* --------------- CONSTANTS --------------- */

    /// @notice EIP712 domain
    bytes32 private constant EIP712_DOMAIN =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    /// @notice route type
    bytes32 private constant ROUTE_TYPE =
        keccak256('Route(address[] addresses,uint256[] ratios)');

    /// @notice order type
    bytes32 private constant ORDER_TYPE =
        keccak256(
            'Order(uint8 order_type,uint256 expiry,uint256 nonce,address benefactor,address beneficiary,address collateral_asset,uint256 collateral_amount,uint256 usdo_amount)'
        );

    /// @notice role enabling to invoke mint
    bytes32 private constant MINTER_ROLE = keccak256('MINTER_ROLE');

    /// @notice role enabling to invoke redeem
    bytes32 private constant REDEEMER_ROLE = keccak256('REDEEMER_ROLE');

    /// @notice role enabling to transfer collateral to custody wallets
    bytes32 private constant COLLATERAL_MANAGER_ROLE =
        keccak256('COLLATERAL_MANAGER_ROLE');

    /// @notice role enabling to disable mint and redeem and remove minters and redeemers in an emergency
    bytes32 private constant GATEKEEPER_ROLE = keccak256('GATEKEEPER_ROLE');

    /// @notice EIP712 domain hash
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256(abi.encodePacked(EIP712_DOMAIN));

    /// @notice address denoting native ether
    address private constant NATIVE_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice EIP712 name
    bytes32 private constant EIP_712_NAME = keccak256('MintRedeem');

    /// @notice holds EIP712 revision
    bytes32 private constant EIP712_REVISION = keccak256('1');

    /// @notice required ratio for route
    uint256 private constant ROUTE_REQUIRED_RATIO = 10_000;

    /* --------------- STATE VARIABLES --------------- */

    /// @notice usdo stablecoin
    IUSDO public immutable usdo;

    /// @notice Supported assets
    EnumerableSet.AddressSet internal _supportedAssets;

    ///@notice Asset destination wallet
    address internal _assetsDestinationWallet;

    /// @notice holds computable chain id
    uint256 private immutable _chainId;

    /// @notice holds computable domain separator
    bytes32 private immutable _domainSeparator;

    /// @notice user deduplication
    mapping(address => mapping(uint256 => uint256)) private _orderBitmaps;

    /// @notice USDO minted per block
    mapping(uint256 => uint256) public mintedPerBlock;
    /// @notice USDO redeemed per block
    mapping(uint256 => uint256) public redeemedPerBlock;

    /// @notice For smart contracts to delegate signing to EOA address
    mapping(address => mapping(address => DelegatedSignerStatus))
        public delegatedSigner;

    /// @notice max minted USDO allowed per block
    uint256 public maxMintPerBlock;
    /// @notice max redeemed USDO allowed per block
    uint256 public maxRedeemPerBlock;

    /* --------------- MODIFIERS --------------- */

    /// @notice ensure that the already minted USDO in the actual block plus the amount to be minted is below the maxMintPerBlock var
    /// @param mintAmount The USDO amount to be minted
    modifier belowMaxMintPerBlock(uint256 mintAmount) {
        if (mintedPerBlock[block.number] + mintAmount > maxMintPerBlock)
            revert MaxMintPerBlockExceeded();
        _;
    }

    /// @notice ensure that the already redeemed USDO in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock var
    /// @param redeemAmount The USDO amount to be redeemed
    modifier belowMaxRedeemPerBlock(uint256 redeemAmount) {
        if (redeemedPerBlock[block.number] + redeemAmount > maxRedeemPerBlock)
            revert MaxRedeemPerBlockExceeded();
        _;
    }

    /* --------------- CONSTRUCTOR --------------- */

    constructor(
        IUSDO _usdo,
        address[] memory _assets,
        address _newAssetDestinationWallet,
        address _admin,
        uint256 _maxMintPerBlock,
        uint256 _maxRedeemPerBlock
    ) {
        if (address(_usdo) == address(0)) revert InvalidusdoAddress();
        if (_assets.length == 0) revert NoAssetsProvided();
        if (_admin == address(0)) revert InvalidZeroAddress();
        usdo = _usdo;
        _assetsDestinationWallet = _newAssetDestinationWallet;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _assets.length; ) {
            addSupportedAsset(_assets[i]);
            unchecked {
                ++i;
            }
        }

        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(_maxMintPerBlock);
        _setMaxRedeemPerBlock(_maxRedeemPerBlock);

        if (msg.sender != _admin) {
            _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        }

        _chainId = block.chainid;
        _domainSeparator = _computeDomainSeparator();

        emit USDOSet(address(_usdo));
    }

    /* --------------- EXTERNAL --------------- */

    /**
     * @notice Fallback function to receive ether
     */
    //@TODO: send eth to wallet
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Mint stablecoins from assets
     * @param order struct containing order details and confirmation from server
     * @param signature signature of the taker
     */
    function mint(
        Order calldata order,
        Signature calldata signature
    )
        external
        override
        nonReentrant
        onlyRole(MINTER_ROLE)
        belowMaxMintPerBlock(order.usdo_amount)
    {
        if (order.order_type != OrderType.MINT) revert InvalidOrder();
        verifyOrder(order, signature);
        _deduplicateOrder(order.benefactor, order.nonce);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order.usdo_amount;
        _transferCollateral(
            order.collateral_amount,
            order.collateral_asset,
            order.benefactor
        );
        usdo.mint(order.beneficiary, order.usdo_amount);
        emit Mint(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral_asset,
            order.collateral_amount,
            order.usdo_amount
        );
    }

    /**
     * @notice Redeem stablecoins for assets
     * @param order struct containing order details and confirmation from server
     * @param signature signature of the taker
     */
    function redeem(
        Order calldata order,
        Signature calldata signature
    )
        external
        override
        nonReentrant
        onlyRole(REDEEMER_ROLE)
        belowMaxRedeemPerBlock(order.usdo_amount)
    {
        if (order.order_type != OrderType.REDEEM) revert InvalidOrder();
        verifyOrder(order, signature);
        _deduplicateOrder(order.benefactor, order.nonce);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.usdo_amount;
        usdo.burnFrom(order.benefactor, order.usdo_amount);
        _transferToBeneficiary(
            order.beneficiary,
            order.collateral_asset,
            order.collateral_amount
        );
        emit Redeem(
            msg.sender,
            order.benefactor,
            order.beneficiary,
            order.collateral_asset,
            order.collateral_amount,
            order.usdo_amount
        );
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param _maxMintPerBlock The new max value
    function setMaxMintPerBlock(
        uint256 _maxMintPerBlock
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxMintPerBlock(_maxMintPerBlock);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param _maxRedeemPerBlock The new max value
    function setMaxRedeemPerBlock(
        uint256 _maxRedeemPerBlock
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxRedeemPerBlock(_maxRedeemPerBlock);
    }

    /// @notice Disables the mint and redeem
    function disableMintRedeem() external onlyRole(GATEKEEPER_ROLE) {
        _setMaxMintPerBlock(0);
        _setMaxRedeemPerBlock(0);
    }

    /// @notice Enables smart contracts to delegate an address for signing
    function setDelegatedSigner(address _delegateTo) external {
        delegatedSigner[_delegateTo][msg.sender] = DelegatedSignerStatus
            .PENDING;
        emit DelegatedSignerInitiated(_delegateTo, msg.sender);
    }

    /// @notice The delegated address to confirm delegation
    function confirmDelegatedSigner(address _delegatedBy) external {
        if (
            delegatedSigner[msg.sender][_delegatedBy] !=
            DelegatedSignerStatus.PENDING
        ) {
            revert DelegationNotInitiated();
        }
        delegatedSigner[msg.sender][_delegatedBy] = DelegatedSignerStatus
            .ACCEPTED;
        emit DelegatedSignerAdded(msg.sender, _delegatedBy);
    }

    /// @notice Enables smart contracts to undelegate an address for signing
    function removeDelegatedSigner(address _removedSigner) external {
        delegatedSigner[_removedSigner][msg.sender] = DelegatedSignerStatus
            .REJECTED;
        emit DelegatedSignerRemoved(_removedSigner, msg.sender);
    }

    /// @notice transfers an asset to a custody wallet
    /// @param asset The asset to be tranfered
    /// @param amount The amount to be tranfered
    function transferToCustody(
        address asset,
        uint256 amount
    ) external nonReentrant onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (asset == NATIVE_TOKEN) {
            (bool success, ) = _assetsDestinationWallet.call{value: amount}('');
            if (!success) revert TransferFailed();
        } else {
            IERC20(asset).safeTransfer(_assetsDestinationWallet, amount);
        }
        emit CustodyTransfer(_assetsDestinationWallet, asset, amount);
    }

    /// @notice Removes an asset from the supported assets list
    function removeSupportedAsset(
        address asset
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_supportedAssets.remove(asset)) revert InvalidAssetAddress();
        emit AssetRemoved(asset);
    }

    /// @notice Checks if an asset is supported.
    function isSupportedAsset(address asset) external view returns (bool) {
        return _supportedAssets.contains(asset);
    }

    /// @notice Removes the minter role from an account, this can ONLY be executed by the gatekeeper role
    /// @param minter The address to remove the minter role from
    function removeMinterRole(
        address minter
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(MINTER_ROLE, minter);
    }

    /// @notice Removes the redeemer role from an account, this can ONLY be executed by the gatekeeper role
    /// @param redeemer The address to remove the redeemer role from
    function removeRedeemerRole(
        address redeemer
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(REDEEMER_ROLE, redeemer);
    }

    /// @notice Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role
    /// @param collateralManager The address to remove the collateralManager role from
    function removeCollateralManagerRole(
        address collateralManager
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager);
    }

    /* --------------- PUBLIC --------------- */

    /// @notice Adds an asset to the supported assets list.
    function addSupportedAsset(
        address asset
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (
            asset == address(0) ||
            asset == address(usdo) ||
            !_supportedAssets.add(asset)
        ) {
            revert InvalidAssetAddress();
        }
        emit AssetAdded(asset);
    }

    /// @notice Get the domain separator for the token
    /// @dev Return cached value if chainId matches cache, otherwise recomputes separator, to prevent replay attack across forks
    /// @return The domain separator of the token at current chain
    function getDomainSeparator() public view returns (bytes32) {
        if (block.chainid == _chainId) {
            return _domainSeparator;
        }
        return _computeDomainSeparator();
    }

    /// @notice hash an Order struct
    function hashOrder(
        Order calldata order
    ) public view override returns (bytes32) {
        return
            MessageHashUtils.toTypedDataHash(
                getDomainSeparator(),
                keccak256(encodeOrder(order))
            );
    }

    function encodeOrder(
        Order calldata order
    ) public pure returns (bytes memory) {
        return
            abi.encode(
                ORDER_TYPE,
                order.order_type,
                order.expiry,
                order.nonce,
                order.benefactor,
                order.beneficiary,
                order.collateral_asset,
                order.collateral_amount,
                order.usdo_amount
            );
    }

    /// @notice assert validity of signed order
    function verifyOrder(
        Order calldata order,
        Signature calldata signature
    ) public view override returns (bytes32 taker_order_hash) {
        taker_order_hash = hashOrder(order);
        address signer = ECDSA.recover(
            taker_order_hash,
            signature.signature_bytes
        );
        if (
            !(signer == order.benefactor ||
                delegatedSigner[signer][order.benefactor] ==
                DelegatedSignerStatus.ACCEPTED)
        ) {
            revert InvalidSignature();
        }
        if (order.beneficiary == address(0)) revert InvalidAddress();
        if (order.collateral_amount == 0) revert InvalidAmount();
        if (order.usdo_amount == 0) revert InvalidAmount();
        if (block.timestamp > order.expiry) revert SignatureExpired();
    }

    /// @notice verify validity of nonce by checking its presence
    function verifyNonce(
        address sender,
        uint256 nonce
    ) public view override returns (uint256, uint256, uint256) {
        if (nonce == 0) revert InvalidNonce();
        uint256 invalidatorSlot = uint64(nonce) >> 8;
        uint256 invalidatorBit = 1 << uint8(nonce);
        uint256 invalidator = _orderBitmaps[sender][invalidatorSlot];
        if (invalidator & invalidatorBit != 0) revert InvalidNonce();

        return (invalidatorSlot, invalidator, invalidatorBit);
    }

    /* --------------- PRIVATE --------------- */

    /// @notice deduplication of taker order
    function _deduplicateOrder(address sender, uint256 nonce) private {
        (
            uint256 invalidatorSlot,
            uint256 invalidator,
            uint256 invalidatorBit
        ) = verifyNonce(sender, nonce);
        _orderBitmaps[sender][invalidatorSlot] = invalidator | invalidatorBit;
    }

    /* --------------- INTERNAL --------------- */

    /// @notice transfer supported asset to beneficiary address
    /// @dev This contract needs to have available funds
    /// @param beneficiary The redeem beneficiary
    /// @param asset The redeemed asset
    /// @param amount The redeemed amount
    function _transferToBeneficiary(
        address beneficiary,
        address asset,
        uint256 amount
    ) internal {
        if (asset == NATIVE_TOKEN) {
            if (address(this).balance < amount) revert InvalidAmount();
            (bool success, ) = (beneficiary).call{value: amount}('');
            if (!success) revert TransferFailed();
        } else {
            if (!_supportedAssets.contains(asset)) revert UnsupportedAsset();
            IERC20(asset).safeTransfer(beneficiary, amount);
        }
    }

    /// @notice transfer supported asset to array of custody addresses per defined ratio
    /// @param amount The amount to be transfered
    /// @param asset The asset to be transfered
    function _transferCollateral(
        uint256 amount,
        address asset,
        address benefactor
    ) internal {
        // cannot mint using unsupported asset or native ETH even if it is supported for redemptions
        if (!_supportedAssets.contains(asset) || asset == NATIVE_TOKEN)
            revert UnsupportedAsset();
        IERC20 token = IERC20(asset);
        token.transferFrom(benefactor, _assetsDestinationWallet, amount);
    }

    /// @notice Sets the max mintPerBlock limit
    function _setMaxMintPerBlock(uint256 _maxMintPerBlock) internal {
        uint256 oldMaxMintPerBlock = maxMintPerBlock;
        maxMintPerBlock = _maxMintPerBlock;
        emit MaxMintPerBlockChanged(oldMaxMintPerBlock, maxMintPerBlock);
    }

    /// @notice Sets the max redeemPerBlock limit
    function _setMaxRedeemPerBlock(uint256 _maxRedeemPerBlock) internal {
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = _maxRedeemPerBlock;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }

    /// @notice Compute the current domain separator
    /// @return The domain separator for the token
    function _computeDomainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN,
                    EIP_712_NAME,
                    EIP712_REVISION,
                    block.chainid,
                    address(this)
                )
            );
    }
}
