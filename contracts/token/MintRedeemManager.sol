// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "../shared/SingleAdminAccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import "./interfaces/IMintRedeemManagerDefs.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title MintRedeemManager
 * @notice This contract mints and redeems the parent USDOM that inherits this contract
 */
contract MintRedeemManager is
    IMintRedeemManagerDefs,
    SingleAdminAccessControl,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    /* --------------- CONSTANTS --------------- */

    /// @notice role enabling to transfer collateral to custody wallets
    bytes32 private constant COLLATERAL_MANAGER_ROLE =
        keccak256("COLLATERAL_MANAGER_ROLE");

    /// @notice role enabling to disable mint and redeem and remove minters and redeemers in an emergency
    bytes32 private constant GATEKEEPER_ROLE = keccak256("GATEKEEPER_ROLE");

    /// @notice address denoting native ether
    address private constant NATIVE_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /* --------------- STATE VARIABLES --------------- */

    /// @notice Supported assets
    /// @dev immutability inferred by non upgradable contract and no edit functions
    MintRedeemManagerTypes.StableCoin public usdt;
    MintRedeemManagerTypes.StableCoin public usdc;

    /// @notice Parent token decimals
    uint256 internal immutable _decimals;

    ///@notice Asset destination wallet
    address internal _assetsDestinationWallet;

    /// @notice USDO minted per block
    mapping(uint256 => uint256) public mintedPerBlock;
    /// @notice USDO redeemed per block
    mapping(uint256 => uint256) public redeemedPerBlock;

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
        MintRedeemManagerTypes.StableCoin memory _usdc,
        MintRedeemManagerTypes.StableCoin memory _usdt,
        address assetDestinationWallet,
        address admin,
        uint256 decimals,
        uint256 _maxMintPerBlock,
        uint256 _maxRedeemPerBlock
    ) {
        if (admin == address(0)) revert InvalidZeroAddress();
        if (assetDestinationWallet == address(0)) revert InvalidZeroAddress();
        if (_usdc.addr == address(0)) revert InvalidZeroAddress();
        if (_usdt.addr == address(0)) revert InvalidZeroAddress();
        if (_usdc.decimals == 0) revert InvalidDecimals();
        if (_usdt.decimals == 0) revert InvalidDecimals();
        if (decimals == 0) revert InvalidDecimals();

        usdc = _usdc;
        usdt = _usdt;
        _assetsDestinationWallet = assetDestinationWallet;
        _decimals = decimals;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(_maxMintPerBlock);
        _setMaxRedeemPerBlock(_maxRedeemPerBlock);

        if (msg.sender != admin) {
            _grantRole(DEFAULT_ADMIN_ROLE, admin);
        }
    }

    /* --------------- EXTERNAL --------------- */

    /**
     * @notice Fallback function to receive ether
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
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

    /// @notice transfers an asset to a custody wallet
    /// @param asset The asset to be tranfered
    /// @param amount The amount to be tranfered
    function transferToCustody(
        address asset,
        uint256 amount
    ) external nonReentrant onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (asset == NATIVE_TOKEN) {
            (bool success, ) = _assetsDestinationWallet.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(asset).safeTransfer(_assetsDestinationWallet, amount);
        }
        emit CustodyTransfer(_assetsDestinationWallet, asset, amount);
    }

    /// @notice Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role
    /// @param collateralManager The address to remove the collateralManager role from
    function removeCollateralManagerRole(
        address collateralManager
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager);
    }

    /* --------------- INTERNAL --------------- */

    /// @notice Check mint and redeem invariant
    /// @dev The minimum amount is 1 USDC and 1 USDT. This invariant holds only if _decimasl >= usdc.decimals >= usdt.decimals
    /// @param order A struct containing the order
    function validateInvariant(
        MintRedeemManagerTypes.Order calldata order
    ) internal view {
        uint256 usdcDecimalsDiff = _decimals - usdc.decimals;
        uint256 usdtDecimalsDiff = _decimals - usdt.decimals;
        uint256 usdc_amount_normalized = order.collateral_usdc_amount *
            (10 ** usdcDecimalsDiff);
        uint256 usdt_amount_normalized = order.collateral_usdt_amount *
            (10 ** usdtDecimalsDiff);
        if (usdc_amount_normalized != usdt_amount_normalized) {
            revert DifferentAssetsAmounts();
        }
        // Their sum must be equal to USDO amount
        if (
            usdc_amount_normalized + usdt_amount_normalized != order.usdo_amount
        ) {
            revert InvalidAssetAmounts();
        }
    }

    /// @notice Mint stablecoins from assets
    /// @param order A struct containing the mint order
    function mintInternal(
        MintRedeemManagerTypes.Order calldata order
    ) internal belowMaxMintPerBlock(order.usdo_amount) {
        validateInvariant(order);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order.usdo_amount;
        _transferCollateral(
            order.collateral_usdc_amount,
            order.collateral_usdc,
            order.benefactor
        );
        _transferCollateral(
            order.collateral_usdt_amount,
            order.collateral_usdt,
            order.benefactor
        );
    }

    /// @notice Redeem stablecoins for assets
    /// @param order struct containing order details and confirmation from server
    function redeemInternal(
        MintRedeemManagerTypes.Order calldata order
    ) internal belowMaxRedeemPerBlock(order.usdo_amount) {
        validateInvariant(order);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.usdo_amount;
        _transferToBeneficiary(
            order.beneficiary,
            order.collateral_usdc,
            order.collateral_usdc_amount
        );
        _transferToBeneficiary(
            order.beneficiary,
            order.collateral_usdt,
            order.collateral_usdt_amount
        );
    }

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
        if (!(asset == usdc.addr || asset == usdt.addr)) {
            revert UnsupportedAsset();
        } else {
            IERC20(asset).safeTransfer(beneficiary, amount);
        }
    }

    /// @notice transfer supported asset to target addresses
    /// @dev User must have approved this contract for allowance
    /// @param amount The amount to be transfered
    /// @param asset The asset to be transfered
    /// @param benefactor The asset benefactor
    function _transferCollateral(
        uint256 amount,
        address asset,
        address benefactor
    ) internal {
        // cannot mint using unsupported asset or native ETH even if it is supported for redemptions
        if (!(asset == usdc.addr || asset == usdt.addr))
            revert UnsupportedAsset();
        IERC20 token = IERC20(asset);
        token.safeTransferFrom(benefactor, _assetsDestinationWallet, amount);
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param _maxMintPerBlock The new max value
    function _setMaxMintPerBlock(uint256 _maxMintPerBlock) internal {
        uint256 oldMaxMintPerBlock = maxMintPerBlock;
        maxMintPerBlock = _maxMintPerBlock;
        emit MaxMintPerBlockChanged(oldMaxMintPerBlock, maxMintPerBlock);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param _maxRedeemPerBlock The new max value
    function _setMaxRedeemPerBlock(uint256 _maxRedeemPerBlock) internal {
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = _maxRedeemPerBlock;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }
}
