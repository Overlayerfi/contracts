// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "../shared/SingleAdminAccessControl.sol";
import "./CollateralSpenderManager.sol";
import "./interfaces/IMintRedeemManagerDefs.sol";
import "./interfaces/IUSDOBacking.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title MintRedeemManager
 * @notice This contract mints and redeems the parent USDOM that inherits this contract
 */
abstract contract MintRedeemManager is
    IMintRedeemManagerDefs,
    CollateralSpenderManager,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    /* --------------- CONSTANTS --------------- */

    /// @notice role enabling to disable mint and redeem and remove minters and redeemers in an emergency
    bytes32 private constant GATEKEEPER_ROLE = keccak256("GATEKEEPER_ROLE");

    /// @notice address denoting native ether
    address private constant NATIVE_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice the minimum amount to trigger the backing collateral
    /// @notice it has to be multiplied to the base (token decimal)
    uint256 private constant BACKING_MIN_AMOUNT_TO_BE_MULTIPLIED_BY_BASE = 1000;

    /* --------------- STATE VARIABLES --------------- */

    /// @notice Parent token decimals
    uint256 internal immutable _decimals;

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
        address admin,
        uint256 decimals,
        uint256 _maxMintPerBlock,
        uint256 _maxRedeemPerBlock
    ) CollateralSpenderManager(admin, _usdc, _usdt) {
        if (decimals == 0) revert InvalidDecimals();
        _decimals = decimals;

        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(_maxMintPerBlock);
        _setMaxRedeemPerBlock(_maxRedeemPerBlock);
    }

    /* --------------- EXTERNAL --------------- */

    /**
     * @notice Fallback function to receive ether
     */
    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice Approve an external spender for USDC and USDT
    /// @dev The spender is handled by the CollateralSpenderManager contract
    function approveCollateral() external onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (approvedCollateralSpender == address(0))
            revert InvalidZeroAddress();
        IERC20(usdc.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(usdt.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
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
    function disableMint() external onlyRole(GATEKEEPER_ROLE) {
        _setMaxMintPerBlock(0);
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
            address(this),
            order.benefactor
        );
        _transferCollateral(
            order.collateral_usdt_amount,
            order.collateral_usdt,
            address(this),
            order.benefactor
        );
    }

    /// @notice Supply funds to the active backing contract (aka approvedCollateralSpender)
    /// @dev the approveCollateralSpender will colect the funds, as the only entity allowed to do so
    function supplyToBacking() external nonReentrant whenNotPaused {
        uint256 usdcBal = IERC20(usdc.addr).balanceOf(address(this));
        uint256 usdtBal = IERC20(usdt.addr).balanceOf(address(this));
        uint256 minAmountUsdc = BACKING_MIN_AMOUNT_TO_BE_MULTIPLIED_BY_BASE *
            (10 ** usdc.decimals);
        uint256 minAmountUsdt = BACKING_MIN_AMOUNT_TO_BE_MULTIPLIED_BY_BASE *
            (10 ** usdt.decimals);

        if (!((usdcBal > minAmountUsdc) && (usdtBal > minAmountUsdt))) {
            revert SupplyAmountNotReached();
        }
        //Get the integer division
        uint256 usdcToMove = (usdcBal / minAmountUsdc) * minAmountUsdc;
        uint256 usdtToMove = (usdtBal / minAmountUsdt) * minAmountUsdt;
        IUSDOBacking(approvedCollateralSpender).supply(usdcToMove, usdtToMove);
        emit SuppliedToBacking(msg.sender, usdcToMove, usdtToMove);
    }

    /// @notice Redeem stablecoins for assets
    /// @param order struct containing order details and confirmation from server
    function redeemInternal(
        MintRedeemManagerTypes.Order calldata order
    )
        internal
        belowMaxRedeemPerBlock(order.usdo_amount)
        returns (uint256 amountToBurn, uint256 usdcBack, uint256 usdtBack)
    {
        amountToBurn = order.usdo_amount;

        validateInvariant(order);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.usdo_amount;

        (
            uint256 checkedBurnAmount,
            uint256 checkedUsdcBack,
            uint256 checkedUsdtBack
        ) = withdrawFromProtocol(order.usdo_amount);

        _transferToBeneficiary(
            order.beneficiary,
            order.collateral_usdc,
            checkedUsdcBack
        );
        _transferToBeneficiary(
            order.beneficiary,
            order.collateral_usdt,
            checkedUsdtBack
        );

        amountToBurn = checkedBurnAmount;
        usdcBack = checkedUsdcBack;
        usdtBack = checkedUsdtBack;
    }

    /// @notice Redeem collateral from the protocol
    /// @dev It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
    /// @param amount The amount of USDO to be unmint
    function withdrawFromProtocol(
        uint256 amount
    )
        internal
        returns (uint256 checkedBurnAmount, uint256 usdcBack, uint256 usdtBack)
    {
        if (amount == 0) {
            return (0, 0, 0);
        }
        //Here does hold the inveriant that _decimals >= token.decimals
        unchecked {
            uint256 diffDecimalsUsdc = _decimals - usdc.decimals;
            uint256 diffDecimalsUsdt = _decimals - usdt.decimals;
            uint256 halfAmount = amount / 2;
            uint256 needAmountUsdc = halfAmount / (10 ** diffDecimalsUsdc);
            uint256 needAmountUsdt = halfAmount / (10 ** diffDecimalsUsdt);
            uint256 usdcBal = IERC20(usdc.addr).balanceOf(address(this));
            uint256 usdtBal = IERC20(usdt.addr).balanceOf(address(this));

            if (needAmountUsdc > usdcBal || needAmountUsdt > usdtBal) {
                uint256 amountFromBackingUsdc = needAmountUsdc - usdcBal;
                uint256 amountFromBackingUsdt = needAmountUsdt - usdtBal;
                IUSDOBacking(approvedCollateralSpender).withdraw(
                    amountFromBackingUsdc,
                    amountFromBackingUsdt
                );
            }

            usdcBack = needAmountUsdc;
            usdtBack = needAmountUsdt;
            checkedBurnAmount =
                (usdcBack * (10 ** diffDecimalsUsdc)) +
                (usdtBack * (10 ** diffDecimalsUsdt));
        }
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
    /// @param recipient The destination address
    /// @param benefactor The asset benefactor
    function _transferCollateral(
        uint256 amount,
        address asset,
        address recipient,
        address benefactor
    ) internal {
        // cannot mint using unsupported asset or native ETH even if it is supported for redemptions
        if (!(asset == usdc.addr || asset == usdt.addr))
            revert UnsupportedAsset();
        IERC20 token = IERC20(asset);
        token.safeTransferFrom(benefactor, recipient, amount);
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
        if (_maxRedeemPerBlock == 0) {
            revert InvalidMaxRedeemAmount();
        }
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = _maxRedeemPerBlock;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }

    /// @notice Pause the contract
    /// @dev This call is used only to lock the supplyToBacking public call
    function pause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _pause();
    }

    /// @notice Unpause the contract
    /// @dev This call is used only to unlock the supplyToBacking public call
    function unpause() external nonReentrant onlyRole(GATEKEEPER_ROLE) {
        _unpause();
    }
}
