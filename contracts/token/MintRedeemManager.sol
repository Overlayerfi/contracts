// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "../shared/SingleAdminAccessControl.sol";
import "./CollateralSpenderManager.sol";
import "./interfaces/IMintRedeemManagerDefs.sol";
import "./interfaces/IUSDOBacking.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title MintRedeemManager
 * @notice This contract mints and redeems the USDO contract that inherits this contract
 */
abstract contract MintRedeemManager is
    IMintRedeemManagerDefs,
    CollateralSpenderManager,
    Pausable
{
    using SafeERC20 for IERC20;

    /* --------------- CONSTANTS --------------- */

    /// @notice Role enabling to disable mint and redeem
    bytes32 private constant GATEKEEPER_ROLE = keccak256("GATEKEEPER_ROLE");

    /* --------------- STATE VARIABLES --------------- */

    /// @notice Parent token decimals
    uint256 internal immutable _decimals;

    /// @notice USDO minted per block
    mapping(uint256 => uint256) public mintedPerBlock;
    /// @notice USDO redeemed per block
    mapping(uint256 => uint256) public redeemedPerBlock;

    /// @notice Max minted USDO allowed per block
    uint256 public maxMintPerBlock;
    /// @notice Max redeemed USDO allowed per block
    uint256 public maxRedeemPerBlock;

    /// @notice If protocol is in emergency mode
    bool public emergencyMode;

    /* --------------- MODIFIERS --------------- */

    /// @notice Ensure that the already minted USDO in the actual block plus the amount to be minted is below the maxMintPerBlock
    /// @param mintAmount The USDO amount to be minted
    modifier belowMaxMintPerBlock(uint256 mintAmount) {
        if (mintedPerBlock[block.number] + mintAmount > maxMintPerBlock)
            revert MintRedeemManagerMaxMintPerBlockExceeded();
        _;
    }

    /// @notice Ensure that the already redeemed USDO in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock
    /// @param redeemAmount The USDO amount to be redeemed
    modifier belowMaxRedeemPerBlock(uint256 redeemAmount) {
        if (redeemedPerBlock[block.number] + redeemAmount > maxRedeemPerBlock)
            revert MintRedeemManagerMaxRedeemPerBlockExceeded();
        _;
    }

    /* --------------- CONSTRUCTOR --------------- */

    constructor(
        MintRedeemManagerTypes.StableCoin memory usdc_,
        MintRedeemManagerTypes.StableCoin memory usdt_,
        MintRedeemManagerTypes.StableCoin memory aUsdc_,
        MintRedeemManagerTypes.StableCoin memory aUsdt_,
        address admin,
        uint256 decimals,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    ) CollateralSpenderManager(admin, usdc_, usdt_, aUsdc_, aUsdt_) {
        if (decimals == 0) revert MintRedeemManagerInvalidDecimals();
        _decimals = decimals;

        // Set the max mint/redeem limits per block
        _setMaxMintPerBlock(maxMintPerBlock_);
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);

        emergencyMode = false;
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
    /// @dev Normally this function is not used as the approval is managed by the acceptance flow
    function approveCollateral() external onlyRole(COLLATERAL_MANAGER_ROLE) {
        if (approvedCollateralSpender == address(0))
            revert MintRedeemManagerInvalidZeroAddress();
        IERC20(usdc.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(usdt.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(aUsdc.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(aUsdt.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param maxMintPerBlock_ The new max value
    function setMaxMintPerBlock(
        uint256 maxMintPerBlock_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxMintPerBlock(maxMintPerBlock_);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param maxRedeemPerBlock_ The new max value
    function setMaxRedeemPerBlock(
        uint256 maxRedeemPerBlock_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMaxRedeemPerBlock(maxRedeemPerBlock_);
    }

    /// @notice Disables the mint and redeem
    function disableMint() external onlyRole(GATEKEEPER_ROLE) {
        _setMaxMintPerBlock(0);
    }

    /// @notice Removes the collateral manager role from an account, this can ONLY be executed by the gatekeeper role
    /// @param collateralManager The address to remove the COLLATERAL_MANAGER_ROLE role from
    function removeCollateralManagerRole(
        address collateralManager
    ) external onlyRole(GATEKEEPER_ROLE) {
        _revokeRole(COLLATERAL_MANAGER_ROLE, collateralManager);
    }

    /// @notice Change the protocol emergency mode
    /// @dev Only default admin can call this function
    /// @dev If any additional stable coin is found (USDC or USDT) is present here, consider calling `supplyToBacking` first as that call may fail if called from here under some unusual circumstances
    /// @param emergencyMode_ The mode to be set
    function setEmergencyStatus(
        bool emergencyMode_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emergencyMode = emergencyMode_;
        emit MintRedeemManagerEmergencyStatus(emergencyMode);
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

    /// @notice Supply funds to the active backing contract (aka approvedCollateralSpender)
    /// @dev The approveCollateralSpender will colect the funds, as the only entity allowed to do so
    /// @param amountUsdc The amount of USDC to supply
    /// @param amountUsdt The amount of USDT to supply
    function supplyToBacking(
        uint256 amountUsdc,
        uint256 amountUsdt
    ) external nonReentrant whenNotPaused {
        if (approvedCollateralSpender != address(0)) {
            uint256 usdcBal = IERC20(emergencyMode ? aUsdc.addr : usdc.addr)
                .balanceOf(address(this));
            uint256 usdtBal = IERC20(emergencyMode ? aUsdt.addr : usdt.addr)
                .balanceOf(address(this));
            uint256 usdcToSupply = amountUsdc == 0 ? usdcBal : amountUsdc;
            uint256 usdtToSupply = amountUsdt == 0 ? usdtBal : amountUsdt;
            if (usdcToSupply > usdcBal || usdtToSupply > usdtBal)
                revert MintRedeemManagerInsufficientFunds();
            IUSDOBacking(approvedCollateralSpender).supply(
                usdcToSupply,
                usdtToSupply
            );
            emit SuppliedToBacking(msg.sender, usdcToSupply, usdtToSupply);
        }
    }

    /* --------------- INTERNAL --------------- */

    /// @notice Check mint and redeem invariant
    /// @dev This invariant holds only if _decimals >= usdc.decimals >= usdt.decimals
    /// @param order A struct containing the order
    function _validateInvariant(
        MintRedeemManagerTypes.Order calldata order
    ) internal view {
        uint256 usdcDecimalsDiff = _decimals -
            (emergencyMode ? aUsdc.decimals : usdc.decimals);
        uint256 usdtDecimalsDiff = _decimals -
            (emergencyMode ? aUsdt.decimals : usdt.decimals);
        uint256 usdcAmountNormalized = order.collateral_usdc_amount *
            (10 ** usdcDecimalsDiff);
        uint256 usdtAmountNormalized = order.collateral_usdt_amount *
            (10 ** usdtDecimalsDiff);
        if (usdcAmountNormalized != usdtAmountNormalized) {
            revert MintRedeemManagerDifferentAssetsAmounts();
        }
        // Their sum must be equal to USDO amount
        if (usdcAmountNormalized + usdtAmountNormalized != order.usdo_amount) {
            revert MintRedeemManagerInvalidAssetAmounts();
        }
    }

    /// @notice Check order parameters based on protocol emergency status
    /// @param order A struct containing the order
    function _validateInputTokens(
        MintRedeemManagerTypes.Order calldata order
    ) internal view {
        if (emergencyMode) {
            if (
                !(order.collateral_usdc == aUsdc.addr &&
                    order.collateral_usdt == aUsdt.addr)
            ) {
                revert MintRedeemManagerCollateralNotValid();
            }
        } else {
            if (
                !(order.collateral_usdc == usdc.addr &&
                    order.collateral_usdt == usdt.addr)
            ) {
                revert MintRedeemManagerCollateralNotValid();
            }
        }
    }

    /// @notice Mint stablecoins from assets
    /// @dev Order benefactor is not used as we constraint it to be the msg.sender at higher level
    /// @dev The received funds are supplied to the backing contract
    /// @param order Struct containing order details
    function _managerMint(
        MintRedeemManagerTypes.Order calldata order
    ) internal belowMaxMintPerBlock(order.usdo_amount) {
        _validateInvariant(order);
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order.usdo_amount;
        _transferCollateral(
            order.collateral_usdc_amount,
            order.collateral_usdc,
            address(this)
        );
        _transferCollateral(
            order.collateral_usdt_amount,
            order.collateral_usdt,
            address(this)
        );
    }

    /// @notice Redeem stablecoins for assets
    /// @param order Struct containing order details
    function _managerRedeem(
        MintRedeemManagerTypes.Order calldata order
    )
        internal
        belowMaxRedeemPerBlock(order.usdo_amount)
        returns (uint256 amountToBurn, uint256 usdcBack, uint256 usdtBack)
    {
        _validateInvariant(order);
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.usdo_amount;

        (
            uint256 checkedBurnAmount,
            uint256 checkedUsdcBack,
            uint256 checkedUsdtBack
        ) = _withdrawFromProtocol(order.usdo_amount);

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
    /// @dev When calling `IUSDOBacking(approvedCollateralSpender).withdraw(...)`,
    /// it is possible that some standard collateral has not yet been converted into aTokens during emergency mode.
    /// Additionally, if a large amount was minted before entering emergency mode, USDC and USDT collateral might become
    /// locked in this contract until they are eventually transferable under unusual circumstances.
    /// We are aware of this issue, and the necessary funds will be manually provided to the `approvedCollateralSpender` to facilitate withdrawals.
    /// @param amount The amount of USDO to burn
    /// @return checkedBurnAmount The checked amount to burn
    /// @return usdcBack The amount of USDC or their aToken version returned to user
    /// @return usdtBack The amount of USDT or their aToken version returned to user
    function _withdrawFromProtocol(
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
            uint256 diffDecimalsUsdc = _decimals -
                (emergencyMode ? aUsdc.decimals : usdc.decimals);
            uint256 diffDecimalsUsdt = _decimals -
                (emergencyMode ? aUsdt.decimals : usdt.decimals);
            uint256 halfAmount = amount / 2;
            uint256 needAmountUsdc = halfAmount / (10 ** diffDecimalsUsdc);
            uint256 needAmountUsdt = halfAmount / (10 ** diffDecimalsUsdt);
            uint256 usdcBal = IERC20(emergencyMode ? aUsdc.addr : usdc.addr)
                .balanceOf(address(this));
            uint256 usdtBal = IERC20(emergencyMode ? aUsdt.addr : usdt.addr)
                .balanceOf(address(this));

            // Compute the needed amount from backing contract
            uint256 amountFromBackingUsdc = 0;
            uint256 amountFromBackingUsdt = 0;
            if (needAmountUsdc > usdcBal) {
                amountFromBackingUsdc = needAmountUsdc - usdcBal;
            }
            if (needAmountUsdt > usdtBal) {
                amountFromBackingUsdt = needAmountUsdt - usdtBal;
            }
            // Retrive funds from backing only if needed
            if (amountFromBackingUsdc > 0 || amountFromBackingUsdt > 0) {
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

    /// @notice Transfer supported asset to beneficiary address
    /// @dev This contract needs to have available funds
    /// @dev Asset validation has to be performed by the caller
    /// @param beneficiary The redeem beneficiary
    /// @param asset The redeemed asset
    /// @param amount The redeemed amount
    function _transferToBeneficiary(
        address beneficiary,
        address asset,
        uint256 amount
    ) internal {
        IERC20(asset).safeTransfer(beneficiary, amount);
    }

    /// @notice Transfer supported asset to target addresses
    /// @dev User must have approved this contract for allowance
    /// @dev Asset validation has to be performed by the caller
    /// @param amount The amount to be transfered
    /// @param asset The asset to be transfered
    /// @param recipient The destination address
    function _transferCollateral(
        uint256 amount,
        address asset,
        address recipient
    ) internal {
        IERC20 token = IERC20(asset);
        token.safeTransferFrom(msg.sender, recipient, amount);
    }

    /// @notice Sets the max mintPerBlock limit
    /// @param maxMintPerBlock_ The new max value
    function _setMaxMintPerBlock(uint256 maxMintPerBlock_) internal {
        uint256 oldMaxMintPerBlock = maxMintPerBlock;
        maxMintPerBlock = maxMintPerBlock_;
        emit MaxMintPerBlockChanged(oldMaxMintPerBlock, maxMintPerBlock);
    }

    /// @notice Sets the max redeemPerBlock limit
    /// @param maxRedeemPerBlock_ The new max value
    function _setMaxRedeemPerBlock(uint256 maxRedeemPerBlock_) internal {
        if (maxRedeemPerBlock_ == 0) {
            revert MintRedeemManagerInvalidMaxRedeemAmount();
        }
        uint256 oldMaxRedeemPerBlock = maxRedeemPerBlock;
        maxRedeemPerBlock = maxRedeemPerBlock_;
        emit MaxRedeemPerBlockChanged(oldMaxRedeemPerBlock, maxRedeemPerBlock);
    }
}
