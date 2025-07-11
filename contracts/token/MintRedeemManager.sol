// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.20;

/* solhint-disable private-vars-leading-underscore */
/* solhint-disable var-name-mixedcase */

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

import "../shared/SingleAdminAccessControl.sol";
import "./CollateralSpenderManager.sol";
import "./interfaces/IMintRedeemManagerDefs.sol";
import "./interfaces/IOverlayerWrapBacking.sol";
import "./types/MintRedeemManagerTypes.sol";

/**
 * @title MintRedeemManager
 * @notice This contract mints and redeems the OverlayerWrap contract that inherits this contract
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

    /// @notice OverlayerWrap minted per block
    mapping(uint256 => uint256) public mintedPerBlock;
    /// @notice OverlayerWrap redeemed per block
    mapping(uint256 => uint256) public redeemedPerBlock;

    /// @notice Max minted OverlayerWrap allowed per block
    uint256 public maxMintPerBlock;
    /// @notice Max redeemed OverlayerWrap allowed per block
    uint256 public maxRedeemPerBlock;

    /// @notice If protocol is in emergency mode
    bool public emergencyMode;

    /* --------------- MODIFIERS --------------- */

    /// @notice Ensure that the already minted OverlayerWrap in the actual block plus the amount to be minted is below the maxMintPerBlock
    /// @param mintAmount The OverlayerWrap amount to be minted
    modifier belowMaxMintPerBlock(uint256 mintAmount) {
        if (mintedPerBlock[block.number] + mintAmount > maxMintPerBlock)
            revert MintRedeemManagerMaxMintPerBlockExceeded();
        _;
    }

    /// @notice Ensure that the already redeemed OverlayerWrap in the actual block plus the amount to be redeemed is below the maxRedeemPerBlock
    /// @param redeemAmount The OverlayerWrap amount to be redeemed
    modifier belowMaxRedeemPerBlock(uint256 redeemAmount) {
        if (redeemedPerBlock[block.number] + redeemAmount > maxRedeemPerBlock)
            revert MintRedeemManagerMaxRedeemPerBlockExceeded();
        _;
    }

    /* --------------- CONSTRUCTOR --------------- */

    constructor(
        MintRedeemManagerTypes.StableCoin memory collateral_,
        MintRedeemManagerTypes.StableCoin memory aCollateral_,
        address admin,
        uint256 decimals,
        uint256 maxMintPerBlock_,
        uint256 maxRedeemPerBlock_
    ) CollateralSpenderManager(admin, collateral_, aCollateral_) {
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
        IERC20(collateral.addr).forceApprove(
            approvedCollateralSpender,
            type(uint256).max
        );
        IERC20(aCollateral.addr).forceApprove(
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
    /// @param amount The amount to supply
    function supplyToBacking(
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (approvedCollateralSpender != address(0)) {
            uint256 collateralBal = IERC20(emergencyMode ? aCollateral.addr : collateral.addr)
                .balanceOf(address(this));
            uint256 amountToSupply = amount == 0 ? collateralBal : amount;
            if (amountToSupply > collateralBal)
                revert MintRedeemManagerInsufficientFunds();
            IOverlayerWrapBacking(approvedCollateralSpender).supply(
                amountToSupply
            );
            emit SuppliedToBacking(msg.sender, amountToSupply);
        }
    }

    /* --------------- INTERNAL --------------- */

    /// @notice Check order parameters based on protocol emergency status
    /// @param order A struct containing the order
    function _validateInputTokens(
        MintRedeemManagerTypes.Order calldata order
    ) internal view {
        if (emergencyMode) {
            if (
                !(order.collateral == aCollateral.addr)
            ) {
                revert MintRedeemManagerCollateralNotValid();
            }
        } else {
            if (
                !(order.collateral == collateral.addr)
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
    ) internal belowMaxMintPerBlock(order.overlayerWrap_amount) {
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the minted amount in this block
        mintedPerBlock[block.number] += order.overlayerWrap_amount;
        _transferCollateral(
            order.collateral_amount,
            order.collateral,
            address(this)
        );
    }

    /// @notice Redeem stablecoins for assets
    /// @param order Struct containing order details
    function _managerRedeem(
        MintRedeemManagerTypes.Order calldata order
    )
        internal
        belowMaxRedeemPerBlock(order.overlayerWrap_amount)
        returns (uint256 amountToBurn, uint256 back)
    {
        // Check for wanted source tokens
        _validateInputTokens(order);
        // Add to the redeemed amount in this block
        redeemedPerBlock[block.number] += order.overlayerWrap_amount;

        (
            uint256 checkedBurnAmount,
            uint256 checkedBack
        ) = _withdrawFromProtocol(order.overlayerWrap_amount);

        _transferToBeneficiary(
            order.beneficiary,
            order.collateral,
            checkedBack
        );

        amountToBurn = checkedBurnAmount;
        back = checkedBack;
    }

    /// @notice Redeem collateral from the protocol
    /// @dev It will trigger the backing contract (aka approvedCollateralSpender) withdraw method if the collateral is not sufficient
    /// @dev When calling `IOverlayerWrapBacking(approvedCollateralSpender).withdraw(...)`,
    /// it is possible that some standard collateral has not yet been converted into aTokens during emergency mode.
    /// Additionally, if a large amount was minted before entering emergency mode, USDC and USDT collateral might become
    /// locked in this contract until they are eventually transferable under unusual circumstances.
    /// We are aware of this issue, and the necessary funds will be manually provided to the `approvedCollateralSpender` to facilitate withdrawals.
    /// @param amount The amount of OverlayerWrap to burn
    /// @return checkedBurnAmount The checked amount to burn
    /// @return back The amount of the underlying or their aToken version returned to user
    function _withdrawFromProtocol(
        uint256 amount
    )
        internal
        returns (uint256 checkedBurnAmount, uint256 back)
    {
        if (amount == 0) {
            return (0, 0);
        }
        //Here does hold the inveriant that _decimals >= token.decimals
        unchecked {
            uint256 diffDecimals = _decimals -
                (emergencyMode ? aCollateral.decimals : collateral.decimals);
            uint256 needAmount = amount / (10 ** diffDecimals);
            uint256 collateralBal = IERC20(emergencyMode ? aCollateral.addr : collateral.addr)
                .balanceOf(address(this));

            // Compute the needed amount from backing contract
            uint256 amountFromBacking = 0;
            if (needAmount > collateralBal) {
                amountFromBacking = needAmount - collateralBal;
            }
            // Retrive funds from backing only if needed
            if (amountFromBacking > 0) {
                IOverlayerWrapBacking(approvedCollateralSpender).withdraw(
                    amountFromBacking
                );
            }

            back = needAmount;
            checkedBurnAmount =
                (back * (10 ** diffDecimals));
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
